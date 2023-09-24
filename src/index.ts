/* eslint-disable @typescript-eslint/no-unnecessary-condition */
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
  getNamedType,
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
   * @description Set the list of models for crud operations
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       models: ['user', 'role']
   * ```
   */
  models?: string[];
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
  disableOperationTypes?: ("query" | "mutation" | "subscription")[];
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
  disableFragments: boolean;
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
  disablePagination: boolean;
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
  enableSubfieldArgs: boolean;
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
  paginationSuffix: string;
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
  maxDepth: number;
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
  queryOperationNamePrefix: string;
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
  mutationOperationNamePrefix: string;
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
  subscriptionOperationNamePrefix: string;
  /**
   * @description Hide variables with configured argument suffixes
   * @default []
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       disableArgSuffixes: ["on_conflict"]
   * ```
   */
  disableArgSuffixes?: string[];

  /**
   * @description Hide fields of the model
   * @default []
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       disableFields: ["updated_at"]
   * ```
   */
  disableFields: string[];

  /**
   * @description Hide fields which contains prefix terms of the model
   * @default []
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       disableFieldPrefixes: ["updated_"]
   * ```
   */
  disableFieldPrefixes: string[];

  /**
   * @description Hide fields which contains suffix terms of the model
   * @default []
   *
   * @exampleMarkdown
   * ```yaml {7}
   * schema: http://localhost:3000/graphql
   * generates:
   *   schema.graphql:
   *     plugins:
   *       - graphql-codegen-hasura-operations
   *     config:
   *       disableFieldSuffixes: ["_aggregate"]
   * ```
   */
  disableFieldSuffixes: string[];

  /**
   * @description Set to false to disable sorting
   * @default false
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

export const plugin: PluginFunction<HasuraGraphQLConfig> = (
  schema: GraphQLSchema,
  _documents,
  {
    maxDepth = 1,
    models = [],
    queryOperationNamePrefix = "Get",
    mutationOperationNamePrefix,
    subscriptionOperationNamePrefix = "Subscribe",
    paginationSuffix = "Pagination",
    disablePagination = false,
    disableOperationTypes,
    commentDescriptions = false,
    enableSubfieldArgs = false,
    disableFragments,
    disableArgSuffixes = [],
    disableFields = [],
    disableFieldPrefixes = [],
    disableFieldSuffixes = [],
  },
): Promise<string> => {
  const transformedSchemaAndAst = transformSchemaAST(schema, {
    commentDescriptions,
  });

  const fragmentTypes = !disableFragments
    ? printFragmentTypes(models, transformedSchemaAndAst.schema, {
        maxDepth,
        enableSubfieldArgs,
        disableArgSuffixes,
        disableFields,
        disableFieldPrefixes,
        disableFieldSuffixes,
      })
    : {};

  return Promise.resolve(
    [
      ...Object.values(fragmentTypes).map((f) => f.content),
      ...printCrudOperations(models, transformedSchemaAndAst.schema, {
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
        disableArgSuffixes,
        disableFields,
        disableFieldPrefixes,
        disableFieldSuffixes,
      }),
    ]
      .filter(Boolean)
      .join("\n"),
  );
};

export const validate: PluginValidateFn<HasuraGraphQLConfig> = (
  _schema: GraphQLSchema,
  _documents: Types.DocumentFile[],
  _config: HasuraGraphQLConfig,
  outputFile: string,
  allPlugins: Types.ConfiguredPlugin[],
) => {
  const singlePlugin = allPlugins.length === 1;

  if (singlePlugin && extname(outputFile) !== ".graphql") {
    throw new Error(
      `Plugin "hasura-graphql" requires extension to be ".graphql"!`,
    );
  }

  if (!_config.models?.length) {
    throw new Error("models are required");
  }

  if (
    _config.disableOperationTypes &&
    _config.disableOperationTypes.some(
      (t) => !["query", "mutation", "subscription"].includes(t),
    )
  ) {
    throw new Error(
      `disableOperationTypes allow "query", "mutation" and "subscription" only`,
    );
  }

  if (_config.maxDepth && _config.maxDepth <= 0) {
    throw new Error(`maxDepth must be larger than 0`);
  }
};

const transformSchemaAST = (
  schema: GraphQLSchema,
  config: {
    commentDescriptions: boolean;
  },
) => {
  let ast = getCachedDocumentNodeFromSchema(schema);
  ast = config.commentDescriptions
    ? visit(ast, {
        leave: (node) => ({
          ...node,
          description: undefined,
        }),
      })
    : ast;
  schema = config.commentDescriptions ? buildASTSchema(ast) : schema;

  return {
    schema,
    ast,
  };
};

const buildModelTypeNameFromSuffixes = (
  modelName: string,
  suffixes?: string[],
): string[] => {
  return (suffixes ?? []).flatMap((suffix) => {
    const argType = `${modelName}_${suffix}`;
    return [argType, camel(argType)];
  });
};

type PrintFragmentTypesOptions = {
  maxDepth: number;
  enableSubfieldArgs: boolean;
  disableArgSuffixes: string[];
  disableFields: string[];
  disableFieldPrefixes: string[];
  disableFieldSuffixes: string[];
};

const printFragmentTypes = (
  tables: string[],
  schema: GraphQLSchema,
  {
    maxDepth,
    enableSubfieldArgs,
    disableArgSuffixes,
    disableFields,
    disableFieldPrefixes,
    disableFieldSuffixes,
  }: PrintFragmentTypesOptions,
): FragmentMap => {
  return tables.reduce((acc, table) => {
    const type = schema.getType(table);
    if (!isOutputType(type) || !isObjectType(type)) {
      return acc;
    }

    const alias = capitalCase(table);
    const disabledArgs = buildModelTypeNameFromSuffixes(
      table,
      disableArgSuffixes,
    );

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
        disabledArgs,
        disableFields,
        disableFieldPrefixes,
        disableFieldSuffixes,
      },
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

type PrintOperationContentOptions = {
  isSubfield: boolean;
  maxDepth: number;
  parents?: Partial<GraphQLField<unknown, unknown, unknown>>[];
  enableSubfieldArgs: boolean;
  disableFragments: boolean;
  disabledArgs: string[];
  fragmentTypes: FragmentMap;
  disableFields: string[];
  disableFieldPrefixes: string[];
  disableFieldSuffixes: string[];
};

const printOperationContent = (
  field: Partial<GraphQLField<unknown, unknown, unknown>>,
  {
    isSubfield = false,
    maxDepth,
    parents = [],
    enableSubfieldArgs,
    disableFragments,
    fragmentTypes,
    disabledArgs,
    disableFields,
    disableFieldPrefixes,
    disableFieldSuffixes,
  }: PrintOperationContentOptions,
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
      disabledArgs,
      disableFields,
      disableFieldPrefixes,
      disableFieldSuffixes,
    },
  );

  const buildArgVariableName = (v: GraphQLArgument) =>
    !isSubfield
      ? v.name
      : `${[...parents.map((p) => p.name), field.name].join("_")}_${v.name}`;

  const requiredArgs = (field.args ?? []).filter((arg) => {
    const typeName = getNamedType(arg.type).name;
    if (isNonNullType(arg.type)) {
      if (disabledArgs.includes(typeName)) {
        throw new Error(
          `The argument ${typeName} is required but in the disabled args list`,
        );
      }

      return true;
    }
    return (
      !disabledArgs.includes(typeName) && (!isSubfield || enableSubfieldArgs)
    );
  });

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
                },
          ),
          ...output.args,
        ]
      : [],
    isScalar: false,
  };
};

type PrintCrudOperationOptions = Omit<HasuraGraphQLConfig, "tables"> & {
  fragmentTypes: FragmentMap;
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
    disableArgSuffixes,
    disableFields,
    disableFieldPrefixes,
    disableFieldSuffixes,
  }: PrintCrudOperationOptions,
): string[] => {
  const queryFields = schema.getQueryType()?.getFields();
  const mutationFields = schema.getMutationType()?.getFields();
  const subscriptionFields = schema.getSubscriptionType()?.getFields();
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

    const disabledArgs = buildModelTypeNameFromSuffixes(
      table,
      disableArgSuffixes,
    );
    const queries: string[] = [];

    if (queryFields && !disableOperationTypes?.includes("query")) {
      const fieldGet =
        queryFields[fieldName] ?? queryFields[fieldNameCamelCase];
      const fieldGetByPk =
        queryFields[fieldByPkName] ?? queryFields[fieldByPkNameCamelCase];
      const fieldAggregate =
        queryFields[aggregateFieldName] ??
        queryFields[aggregateFieldNameCamelCase];

      if (!disablePagination && Boolean(fieldAggregate) && Boolean(fieldGet)) {
        const getContent = printOperationContent(fieldGet, {
          isSubfield: false,
          maxDepth,
          enableSubfieldArgs,
          disableFragments,
          fragmentTypes,
          disabledArgs,
          disableFields,
          disableFieldPrefixes,
          disableFieldSuffixes,
        });
        const args = printOperationArgs(getContent.args);
        queries.push(`query ${queryOperationNamePrefix ?? ""}${capitalCase(
          fieldGet.name,
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
            disabledArgs,
            disableFields,
            disableFieldPrefixes,
            disableFieldSuffixes,
          }),
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
            disabledArgs,
            disableFields,
            disableFieldPrefixes,
            disableFieldSuffixes,
          }),
        );
      }
    }

    if (
      subscriptionFields &&
      !disableOperationTypes?.includes("subscription")
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
            disabledArgs: [],
            disableFields,
            disableFieldPrefixes,
            disableFieldSuffixes,
          }),
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
            disabledArgs,
            disableFields,
            disableFieldPrefixes,
            disableFieldSuffixes,
          }),
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
            disabledArgs,
            disableFields,
            disableFieldPrefixes,
            disableFieldSuffixes,
          }),
        );
      }
    }

    if (mutationFields && !disableOperationTypes?.includes("mutation")) {
      const mutationManyNames = [
        insertFieldName,
        insertFieldNameCamelCase,
        updateFieldName,
        updateFieldNameCamelCase,
        updateManyFieldName,
        updateManyFieldNameCamelCase,
        deleteFieldName,
        deleteFieldNameCamelCase,
      ];

      const mutationQueries = [
        insertFieldName,
        insertFieldNameCamelCase,
        insertOneFieldName,
        insertOneFieldNameCamelCase,
        updateFieldName,
        updateFieldNameCamelCase,
        updateManyFieldName,
        updateManyFieldNameCamelCase,
        updateByPkFieldName,
        updateByPkFieldNameCamelCase,
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
            maxDepth: mutationManyNames.includes(f.name)
              ? maxDepth + 1
              : maxDepth,
            enableSubfieldArgs,
            disableFragments,
            fragmentTypes,
            disabledArgs,
            disableFields,
            disableFieldPrefixes,
            disableFieldSuffixes,
          }),
        );

      queries.push(...mutationQueries);
    }

    if (!queries.length) {
      throw new Error(
        `table ${table} doesn't exist, or maybe the role doesn't have any permission`,
      );
    }
    return queries;
  });
};

const printOperationArgs = (args: readonly GraphQLArgument[]) =>
  !args?.length
    ? ""
    : `(${args.map((v) => `$${v.name}: ${v.type.toString()}`).join(", ")})`;

type PrintOperationOptions = Omit<
  PrintOperationContentOptions,
  "isSubfield"
> & {
  prefix: string;
};

const printOperation = (
  operationType: "query" | "mutation" | "subscription",
  field: Partial<GraphQLField<unknown, unknown>>,
  {
    prefix = "",
    maxDepth,
    enableSubfieldArgs,
    disableFragments,
    fragmentTypes,
    disabledArgs,
    disableFields,
    disableFieldPrefixes,
    disableFieldSuffixes,
  }: PrintOperationOptions,
) => {
  const op = printOperationContent(field, {
    isSubfield: false,
    maxDepth,
    enableSubfieldArgs,
    disableFragments,
    fragmentTypes,
    disabledArgs,
    disableFields,
    disableFieldPrefixes,
    disableFieldSuffixes,
  });
  const args = printOperationArgs(op.args);

  return `${operationType} ${prefix || ""}${capitalCase(
    field.name ?? "",
  )}${args} {
${printIndent(op.query, 1)}
}`;
};

type PrintOutputFieldOptions = Omit<
  PrintOperationContentOptions,
  "isSubfield"
> & {
  hideName?: boolean;
};

const printOutputField = (
  field: Partial<GraphQLField<unknown, unknown>>,
  {
    maxDepth,
    parents = [],
    hideName = false,
    enableSubfieldArgs,
    disableFragments,
    fragmentTypes = {},
    disabledArgs,
    disableFields,
    disableFieldPrefixes,
    disableFieldSuffixes,
  }: PrintOutputFieldOptions,
): PrintGraphQLOutput => {
  if (
    !field.name ||
    disableFields.includes(field.name) ||
    disableFieldPrefixes.some((prefix) => field.name!.startsWith(prefix)) ||
    disableFieldSuffixes.some((suffix) => field.name!.endsWith(suffix)) ||
    parents.some(
      (p) =>
        p.name === field.name &&
        (p.type as GraphQLObjectType).name ===
          (field.type as GraphQLObjectType).name,
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
      disabledArgs,
      disableFields,
      disableFieldPrefixes,
      disableFieldSuffixes,
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
        disabledArgs,
        disableFields,
        disableFieldPrefixes,
        disableFieldSuffixes,
      },
    );
  }

  if (isObjectType(field.type)) {
    if (parents.length > maxDepth - 1) {
      return { query: "", args: [], isScalar: false };
    }

    if (fragmentTypes[field.type.name]) {
      const fragment = fragmentTypes[field.type.name];
      return {
        query: `${!hideName ? field.name : ""} {
  ...${fragment.name}  
}`,
        args: fragment.args,
        isScalar: false,
      };
    }

    let args: GraphQLArgument[] = [];
    const innerQuery = Object.values(
      (field.type as GraphQLObjectType).getFields(),
    )
      .map((f) => {
        const output = printOutputField(f, {
          maxDepth,
          parents: [...parents, field],
          enableSubfieldArgs,
          disableFragments,
          fragmentTypes,
          disabledArgs,
          disableFields,
          disableFieldPrefixes,
          disableFieldSuffixes,
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
    let args: GraphQLArgument[] = [];
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
      },
      {
        maxDepth,
        parents: [...(parents || []), field],
        enableSubfieldArgs,
        disableFragments,
        fragmentTypes,
        disabledArgs,
        disableFields,
        disableFieldPrefixes,
        disableFieldSuffixes,
      },
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
    let args: GraphQLArgument[] = [];
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
      disabledArgs,
      disableFields,
      disableFieldPrefixes,
      disableFieldSuffixes,
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
    query: !hideName ? field.name ?? "" : "",
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
      "",
    );
