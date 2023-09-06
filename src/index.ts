import {
  getCachedDocumentNodeFromSchema,
  PluginFunction,
  PluginValidateFn,
  Types,
} from "@graphql-codegen/plugin-helpers";
import {
  buildASTSchema,
  GraphQLSchema,
  visit,
  isNonNullType,
  isObjectType,
  isListType,
  GraphQLOutputType,
  GraphQLObjectType,
  isUnionType,
  isInterfaceType,
  GraphQLField,
  GraphQLArgument,
  GraphQLList,
  isOutputType,
} from "graphql";
import { extname } from "path";
import { snake, camel } from "radash";

const nonAlphaDigitPattern = new RegExp("[^0-9a-zA-Z]", "g");
const spacePattern = new RegExp("\\s+");

/**
 * @description This plugin prints the merged schema as string. If multiple schemas are provided, they will be merged and printed as one schema.
 */
export type HasuraGraphQLConfig = {
  /**
   * @description Set to true in order to print description as comments (using `#` instead of `"""`)
   * @default false
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       commentDescriptions: true
   * ```
   */
  commentDescriptions?: boolean;
  /**
   * @description Set the list of table for crud operations
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       tables: ['user', 'role']
   * ```
   */
  tables?: string[];
  /**
   * @description Set the list of operation types that you want to disable
   * @default false
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       disableOperationTypes: ['subscription']
   * ```
   */
  disableOperationTypes?: Array<"query" | "mutation" | "subscription">;
  /**
   * @description Set to true if you don't want to generating fragments returning types
   * @default false
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       disableFragments: true
   * ```
   */
  disableFragments?: boolean;
  /**
   * @description Set to true if you don't want to generate pagination queries
   * @default false
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       disablePagination: true
   * ```
   */
  disablePagination?: boolean;
  /**
   * @description Set to true if you want to generate subfield arguments
   * @default false
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       enableSubfieldArgs: true
   * ```
   */
  enableSubfieldArgs?: boolean;
  /**
   * @description Set the suffix for pagination operation name
   * @default Pagination
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       paginationSuffix: Pagination
   * ```
   */
  paginationSuffix?: string;
  /**
   * @description Set the max depth of nested objects
   * @default 1
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       maxDepth: 1
   * ```
   */
  maxDepth?: number;
  /**
   * @description Set the prefix for query operation name
   * @default Get
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       queryOperationNamePrefix: Get
   * ```
   */
  queryOperationNamePrefix?: string;
  /**
   * @description Set the prefix for mutation operation name
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       mutationOperationNamePrefix: Mutate
   * ```
   */
  mutationOperationNamePrefix?: string;
  /**
   * @description Set the prefix for subscription operation name
   * @default Subscribe
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       subscriptionOperationNamePrefix: Subscribe
   * ```
   */
  subscriptionOperationNamePrefix?: string;
  /**
   * @description Set to false to disable sorting
   * @default true
   */
  sort?: boolean;
  federation?: boolean;
};

type PrintGraphQLOutput = {
  query: string;
  args: readonly GraphQLArgument[];
  isScalar: boolean;
};

type FragmentMap = Record<
  string,
  { name: string; content: string; args: readonly GraphQLArgument[] }
>;

export const plugin: PluginFunction<HasuraGraphQLConfig> = async (
  schema: GraphQLSchema,
  _documents,
  {
    maxDepth = 1,
    tables,
    queryOperationNamePrefix = "Get",
    mutationOperationNamePrefix,
    subscriptionOperationNamePrefix = "Subscribe",
    paginationSuffix = "Pagination",
    disablePagination = false,
    disableOperationTypes,
    sort = false,
    federation,
    commentDescriptions,
    enableSubfieldArgs,
    disableFragments,
  }
): Promise<string> => {
  const transformedSchemaAndAst = transformSchemaAST(schema, {
    sort: sort,
    federation: federation,
    commentDescriptions: commentDescriptions,
  });

  const fragmentTypes = !disableFragments
    ? printFragmentTypes(tables, transformedSchemaAndAst.schema, {
        maxDepth,
        enableSubfieldArgs,
      })
    : {};

  return [
    ...Object.values(fragmentTypes).map((f) => f.content),
    ...printCrudOperations(tables, transformedSchemaAndAst.schema, {
      maxDepth,
      queryOperationNamePrefix,
      mutationOperationNamePrefix,
      subscriptionOperationNamePrefix,
      paginationSuffix,
      disablePagination,
      disableOperationTypes,
      enableSubfieldArgs,
      disableFragments,
      fragmentTypes,
    }),
    // ...printOperations(
    //   "query",
    //   transformedSchemaAndAst.schema.getQueryType().getFields(),
    //   { prefix: queryOperationNamePrefix, maxDepth }
    // ),
    // ...printOperations(
    //   "mutation",
    //   transformedSchemaAndAst.schema.getMutationType().getFields(),
    //   { prefix: mutationOperationNamePrefix, maxDepth }
    // ),
    // ...printOperations(
    //   "subscription",
    //   transformedSchemaAndAst.schema.getSubscriptionType().getFields(),
    //   { prefix: subscriptionOperationNamePrefix, maxDepth }
    // ),
  ]
    .filter(Boolean)
    .join("\n");
};

export const validate: PluginValidateFn<any> = async (
  _schema: GraphQLSchema,
  _documents: Types.DocumentFile[],
  _config: HasuraGraphQLConfig,
  outputFile: string,
  allPlugins: Types.ConfiguredPlugin[]
) => {
  const singlePlugin = allPlugins.length === 1;

  if (singlePlugin && extname(outputFile) !== ".graphql") {
    throw new Error(
      `Plugin "hasura-graphql" requires extension to be ".graphql"!`
    );
  }

  if (
    _config.disableOperationTypes &&
    _config.disableOperationTypes.some(
      (t) => !["query", "mutation", "subscription"].includes(t)
    )
  ) {
    throw new Error(
      `disableOperationTypes allow "query", "mutation" and "subscription" only`
    );
  }
};

const transformSchemaAST = (
  schema: GraphQLSchema,
  config: { [key: string]: any }
) => {
  let ast = getCachedDocumentNodeFromSchema(schema);
  ast = config.disableDescriptions
    ? visit(ast, {
        leave: (node) => ({
          ...node,
          description: undefined,
        }),
      })
    : ast;
  schema = config.disableDescriptions ? buildASTSchema(ast) : schema;

  return {
    schema,
    ast,
  };
};

const printFragmentTypes = (
  tables: string[],
  schema: GraphQLSchema,
  { maxDepth, enableSubfieldArgs }
): FragmentMap => {
  return tables.reduce((acc, table) => {
    const type = schema.getType(table);
    if (!type || !isOutputType(type) || !isObjectType(type)) {
      return acc;
    }

    const alias = capitalCase(table);
    const output = printOutputField(
      {
        name: alias,
        type: type,
      },
      {
        hideName: true,
        maxDepth,
        parents: [],
        enableSubfieldArgs,
        disableFragments: false,
        fragmentTypes: {},
      }
    );

    return {
      ...acc,
      [table]: {
        name: alias,
        content: `fragment ${alias} on ${table} ${output.query}`,
        args: output.args,
      },
    };
  }, {});
};

const printOperationContent = (
  field: Partial<GraphQLField<any, any, any>>,
  {
    isSubfield = false,
    maxDepth,
    parents = [] as Partial<GraphQLField<any, any, any>>[],
    enableSubfieldArgs,
    disableFragments,
    fragmentTypes,
  }
): PrintGraphQLOutput => {
  const output = printOutputField(
    {
      ...field,
      args: [],
    },
    {
      maxDepth,
      parents,
      hideName: true,
      enableSubfieldArgs,
      disableFragments,
      fragmentTypes,
    }
  );

  const buildArgVariableName = (v: GraphQLArgument) =>
    !isSubfield
      ? v.name
      : `${[...parents.map((p) => p.name), field.name].join("_")}_${v.name}`;

  const requiredArgs = (field.args || []).filter(
    (arg) => !isSubfield || enableSubfieldArgs || isNonNullType(arg.type)
  );

  const argString = requiredArgs
    .map((v) => `${v.name}: $${buildArgVariableName(v)}`)
    .join(",");

  const query =
    output.query || output.isScalar
      ? `${field.name}${argString ? `(${argString})` : ""}${output.query}`
      : "";
  return {
    query,
    args: query
      ? [
          ...requiredArgs.map((f) =>
            !isSubfield
              ? f
              : {
                  ...f,
                  name: buildArgVariableName(f),
                }
          ),
          ...output.args,
        ]
      : [],
    isScalar: false,
  };
};

const printCrudOperations = (
  tables: string[],
  schema: GraphQLSchema,
  {
    queryOperationNamePrefix,
    mutationOperationNamePrefix,
    subscriptionOperationNamePrefix,
    disableOperationTypes,
    paginationSuffix,
    disablePagination,
    maxDepth,
    enableSubfieldArgs,
    disableFragments,
    fragmentTypes,
  }
): string[] => {
  const queryFields = schema.getQueryType().getFields();
  const mutationFields = schema.getMutationType().getFields();
  const subscriptionFields = schema.getSubscriptionType().getFields();
  return tables.flatMap((table) => {
    const fieldName = snake(table);
    const fieldByPkName = snake(`${fieldName}_by_pk`);
    const aggregateFieldName = `${fieldName}_aggregate`;
    const insertFieldName = `insert_${fieldName}`;
    const insertOneFieldName = `insert_${fieldName}_one`;
    const updateFieldName = `update_${fieldName}`;
    const updateByPkFieldName = `update_${fieldName}_by_pk`;
    const updateManyFieldName = `update_${fieldName}_many`;
    const deleteFieldName = `delete_${fieldName}`;
    const deleteByPkFieldName = `delete_${fieldName}_by_pk`;
    const streamFieldName = `${fieldName}_stream`;

    const fieldNameCamelCase = camel(table);
    const fieldByPkNameCamelCase = camel(fieldByPkName);
    const aggregateFieldNameCamelCase = camel(aggregateFieldName);
    const insertFieldNameCamelCase = camel(insertFieldName);
    const insertOneFieldNameCamelCase = camel(insertOneFieldName);
    const updateFieldNameCamelCase = camel(updateFieldName);
    const updateByPkFieldNameCamelCase = camel(updateByPkFieldName);
    const updateManyFieldNameCamelCase = camel(updateManyFieldName);
    const deleteFieldNameCamelCase = camel(deleteFieldName);
    const deleteByPkFieldNameCamelCase = camel(deleteByPkFieldName);
    const streamFieldNameCamelCase = camel(streamFieldName);

    const queries = [];

    if (
      !disableOperationTypes?.length ||
      !disableOperationTypes.includes("query")
    ) {
      const fieldGet =
        queryFields[fieldName] || queryFields[fieldNameCamelCase];
      const fieldGetByPk =
        queryFields[fieldByPkName] || queryFields[fieldByPkNameCamelCase];
      const fieldAggregate =
        queryFields[aggregateFieldName] ||
        queryFields[aggregateFieldNameCamelCase];

      if (!disablePagination && fieldAggregate && fieldGet) {
        const getContent = printOperationContent(fieldGet, {
          isSubfield: false,
          maxDepth,
          enableSubfieldArgs,
          disableFragments,
          fragmentTypes,
        });
        const args = printOperationArgs(getContent.args);
        queries.push(`query ${queryOperationNamePrefix || ""}${capitalCase(
          fieldGet.name
        )}${paginationSuffix}${args} {
${printIndent(getContent.query, 1)}
  ${fieldAggregate.name}(where: $where) {
    aggregate {
      count
    }
  }
}`);
      }
      if (fieldGet) {
        queries.push(
          printOperation("query", fieldGet, {
            prefix: queryOperationNamePrefix,
            maxDepth,
            enableSubfieldArgs,
            disableFragments,
            fragmentTypes,
          })
        );
      }

      if (fieldGetByPk) {
        queries.push(
          printOperation("query", fieldGetByPk, {
            prefix: queryOperationNamePrefix,
            maxDepth,
            enableSubfieldArgs,
            disableFragments,
            fragmentTypes,
          })
        );
      }
    }

    if (
      !disableOperationTypes?.length ||
      !disableOperationTypes.includes("subscription")
    ) {
      const fieldGet =
        subscriptionFields[fieldName] || subscriptionFields[fieldNameCamelCase];
      const fieldGetByPk =
        subscriptionFields[fieldByPkName] ||
        subscriptionFields[fieldByPkNameCamelCase];
      const fieldStream =
        subscriptionFields[streamFieldName] ||
        subscriptionFields[streamFieldNameCamelCase];

      if (fieldGet) {
        queries.push(
          printOperation("subscription", fieldGet, {
            prefix: subscriptionOperationNamePrefix,
            maxDepth,
            enableSubfieldArgs,
            disableFragments,
            fragmentTypes,
          })
        );
      }

      if (fieldGetByPk) {
        queries.push(
          printOperation("subscription", fieldGetByPk, {
            prefix: subscriptionOperationNamePrefix,
            maxDepth,
            enableSubfieldArgs,
            disableFragments,
            fragmentTypes,
          })
        );
      }

      if (fieldStream) {
        queries.push(
          printOperation("subscription", fieldStream, {
            prefix: subscriptionOperationNamePrefix,
            maxDepth,
            enableSubfieldArgs,
            disableFragments,
            fragmentTypes,
          })
        );
      }
    }

    if (
      !disableOperationTypes?.length ||
      !disableOperationTypes.includes("mutation")
    ) {
      const mutationQueries = [
        insertFieldName,
        insertFieldNameCamelCase,
        insertOneFieldName,
        insertOneFieldNameCamelCase,
        updateFieldName,
        updateFieldNameCamelCase,
        updateByPkFieldName,
        updateByPkFieldNameCamelCase,
        updateManyFieldName,
        updateManyFieldNameCamelCase,
        deleteFieldName,
        deleteFieldNameCamelCase,
        deleteByPkFieldName,
        deleteByPkFieldNameCamelCase,
      ]
        .map((name) => mutationFields[name])
        .filter((f) => f)
        .map((f) =>
          printOperation("mutation", f, {
            prefix: mutationOperationNamePrefix,
            maxDepth,
            enableSubfieldArgs,
            disableFragments,
            fragmentTypes,
          })
        );

      queries.push(...mutationQueries);
    }

    if (!queries.length) {
      throw new Error(
        `table ${table} doesn't exist, or maybe the role doesn't have any permission`
      );
    }
    return queries;
  });
};

const printOperationArgs = (args: readonly GraphQLArgument[]) =>
  !args?.length
    ? ""
    : `(${args.map((v) => `$${v.name}: ${v.type.toString()}`).join(", ")})`;

const printOperation = (
  operationType: "query" | "mutation" | "subscription",
  field: Partial<GraphQLField<any, any>>,
  { prefix = "", maxDepth, enableSubfieldArgs, disableFragments, fragmentTypes }
) => {
  const op = printOperationContent(field, {
    isSubfield: false,
    maxDepth,
    enableSubfieldArgs,
    disableFragments,
    fragmentTypes,
  });
  const args = printOperationArgs(op.args);

  return `${operationType} ${prefix || ""}${capitalCase(field.name)}${args} {
${printIndent(op.query, 1)}
}`;
};

const printOutputField = (
  field: Partial<GraphQLField<any, any>>,
  {
    maxDepth,
    parents = [] as Partial<GraphQLField<any, any, any>>[],
    hideName = false,
    enableSubfieldArgs,
    disableFragments,
    fragmentTypes = {} as FragmentMap,
  }
): PrintGraphQLOutput => {
  if (
    parents.some(
      (p) =>
        p.name === field.name &&
        (p.type as GraphQLObjectType).name ===
          (field.type as GraphQLObjectType).name
    ) ||
    parents.length > maxDepth
  ) {
    return { query: "", args: [], isScalar: false };
  }

  if (parents?.length && field.args?.length) {
    return printOperationContent(field, {
      isSubfield: true,
      maxDepth,
      parents,
      enableSubfieldArgs,
      disableFragments,
      fragmentTypes,
    });
  }

  if (isListType(field.type) || isNonNullType(field.type)) {
    return printOutputField(
      {
        ...field,
        type: (field.type as GraphQLList<GraphQLOutputType>).ofType,
      },
      {
        maxDepth,
        parents,
        hideName,
        enableSubfieldArgs,
        disableFragments,
        fragmentTypes,
      }
    );
  }

  if (isObjectType(field.type)) {
    if (parents.length > maxDepth - 1) {
      return { query: "", args: [], isScalar: false };
    }

    if (fragmentTypes && fragmentTypes[field.type.name]) {
      const fragment = fragmentTypes[field.type.name];
      return {
        query: `${!hideName ? field.name : ""} {
  ...${fragment.name}  
}`,
        args: fragment.args,
        isScalar: false,
      };
    }

    let args = [];
    const innerQuery = Object.values(
      (field.type as GraphQLObjectType).getFields()
    )
      .map((f) => {
        const output = printOutputField(f, {
          maxDepth,
          parents: [...parents, field],
          enableSubfieldArgs,
          disableFragments,
          fragmentTypes,
        });
        args = args.concat(output.args);
        return output.query;
      })
      .filter((s) => s.trim())
      .join("\n");
    return {
      query: innerQuery
        ? `${!hideName ? field.name : ""} {\n${printIndent(innerQuery, 1)}\n}`
        : "",
      args,
      isScalar: false,
    };
  }

  if (isUnionType(field.type)) {
    let args = [];
    const query = `{
${[
  "  __typename",
  ...field.type.getTypes().map((ty) => {
    const output = printOutputField(
      {
        name: ty.name,
        type: ty,
        args: [],
        description: "",
      } as any,
      {
        maxDepth,
        parents: [...(parents || []), field],
        enableSubfieldArgs,
        disableFragments,
        fragmentTypes,
      }
    );
    args = args.concat(output.args);
    return `  ... on ${output.query}`;
  }),
].join("\n")}
}`;
    return {
      query,
      args,
      isScalar: false,
    };
  }

  if (isInterfaceType(field.type)) {
    let args = [];
    const query = `{
  __typename
${Object.values(field.type.getFields())
  .map((f) => {
    const output = printOutputField(f, {
      maxDepth,
      parents: [...(parents || []), f],
      enableSubfieldArgs,
      disableFragments,
      fragmentTypes,
    });
    args = args.concat(output.args);
    return printIndent(output.query, 1);
  })
  .join("\n")}
}`;
    return {
      query,
      args,
      isScalar: false,
    };
  }

  return {
    query: !hideName ? field.name : "",
    args: [],
    isScalar: true,
  };
};

const getIndentSpaces = (level: number): string => {
  let spaces = "";
  for (let i = 0; i < level; i++) {
    spaces += "  ";
  }
  return spaces;
};

const printIndent = (input: string, level: number): string => {
  if (!level) {
    return input;
  }
  const spaces = getIndentSpaces(level);

  return input
    .split("\n")
    .map((s) => spaces + s)
    .join("\n");
};

const capitalCase = (input: string): string =>
  input
    .replace(nonAlphaDigitPattern, " ")
    .trim()
    .replace(spacePattern, " ")
    .split(" ")
    .reduce(
      (acc, s) => acc + s.substring(0, 1).toUpperCase() + s.substring(1),
      ""
    );
