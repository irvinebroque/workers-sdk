import path from "node:path";
import TOML from "@iarna/toml";
import { Diagnostics } from "./diagnostics";
import {
  deprecated,
  experimental,
  hasProperty,
  inheritable,
  isBoolean,
  isObjectWith,
  isOneOf,
  isOptionalProperty,
  isRequiredProperty,
  isString,
  isStringArray,
  validateAdditionalProperties,
  notInheritable,
  validateOptionalProperty,
  validateOptionalTypedArray,
  validateRequiredProperty,
  validateTypedArray,
  all,
  isMutuallyExclusiveWith,
  inheritableInLegacyEnvironments,
} from "./validation-helpers";
import type { Config, DevConfig, RawConfig, RawDevConfig } from "./config";
import type {
  RawEnvironment,
  DeprecatedUpload,
  Environment,
  Rule,
} from "./environment";
import type { ValidatorFn } from "./validation-helpers";

/**
 * Validate the given `rawConfig` object that was loaded from `configPath`.
 *
 * The configuration is normalized, which includes using default values for missing field,
 * and copying over inheritable fields into named environments.
 *
 * Any errors or warnings from the validation are available in the returned `diagnostics` object.
 */
export function normalizeAndValidateConfig(
  rawConfig: RawConfig,
  configPath: string | undefined,
  envName: string | undefined
): {
  config: Config;
  diagnostics: Diagnostics;
} {
  const diagnostics = new Diagnostics(
    `Processing ${
      configPath ? path.relative(process.cwd(), configPath) : "wrangler"
    } configuration:`
  );

  deprecated(
    diagnostics,
    rawConfig,
    "type",
    "DO NOT USE THIS. Most common features now work out of the box with wrangler, including modules, jsx, typescript, etc. If you need anything more, use a custom build.",
    true
  );

  deprecated(
    diagnostics,
    rawConfig,
    "webpack_config",
    "DO NOT USE THIS. Most common features now work out of the box with wrangler, including modules, jsx, typescript, etc. If you need anything more, use a custom build.",
    true
  );

  deprecated(
    diagnostics,
    rawConfig,
    `site.entry-point`,
    `The \`site.entry-point\` config field is no longer used.\nThe entry-point should be specified via the command line or the \`main\` config field.`,
    false,
    true
  );

  validateOptionalProperty(
    diagnostics,
    "",
    "legacy_env",
    rawConfig.legacy_env,
    "boolean"
  );

  // TODO: set the default to false to turn on service environments as the default
  const isLegacyEnv = rawConfig.legacy_env ?? true;

  const topLevelEnv = normalizeAndValidateEnvironment(
    diagnostics,
    configPath,
    rawConfig
  );

  let activeEnv = topLevelEnv;
  if (envName !== undefined) {
    const rawEnv = rawConfig.env?.[envName];
    if (rawEnv !== undefined) {
      const envDiagnostics = new Diagnostics(
        `"env.${envName}" environment configuration`
      );
      activeEnv = normalizeAndValidateEnvironment(
        envDiagnostics,
        configPath,
        rawEnv,
        envName,
        topLevelEnv,
        isLegacyEnv,
        rawConfig
      );
      diagnostics.addChild(envDiagnostics);
    } else {
      const envNames = rawConfig.env
        ? `The available configured environment names are: ${JSON.stringify(
            Object.keys(rawConfig.env)
          )}\n`
        : "";
      const message =
        `No environment found in configuration with name "${envName}".\n` +
        `Before using \`--env=${envName}\` there should be an equivalent environment section in the configuration.\n` +
        `${envNames}\n` +
        `Consider adding an environment configuration section to the wrangler.toml file:\n` +
        "```\n[env." +
        envName +
        "]\n```\n";

      if (envNames.length > 0) {
        diagnostics.errors.push(message);
      } else {
        // Only warn (rather than error) if there are not actually any environments configured in wrangler.toml.
        diagnostics.warnings.push(message);
      }
    }
  }

  // Process the top-level default environment configuration.
  const config: Config = {
    configPath,
    legacy_env: isLegacyEnv,
    ...activeEnv,
    dev: normalizeAndValidateDev(diagnostics, rawConfig.dev ?? {}),
    migrations: normalizeAndValidateMigrations(
      diagnostics,
      rawConfig.migrations ?? []
    ),
    site: normalizeAndValidateSite(diagnostics, rawConfig.site),
    wasm_modules: normalizeAndValidateModulePaths(
      diagnostics,
      configPath,
      "wasm_modules",
      rawConfig.wasm_modules
    ),
    text_blobs: normalizeAndValidateModulePaths(
      diagnostics,
      configPath,
      "text_blobs",
      rawConfig.text_blobs
    ),
  };

  validateAdditionalProperties(
    diagnostics,
    "top-level",
    Object.keys(rawConfig),
    [...Object.keys(config), "env", "miniflare"]
  );

  return { config, diagnostics };
}

/**
 * Validate the `build` configuration and return the normalized values.
 */
function normalizeAndValidateBuild(
  diagnostics: Diagnostics,
  rawEnv: RawEnvironment,
  rawBuild: Config["build"],
  configPath: string | undefined
): Config["build"] & { deprecatedUpload: DeprecatedUpload } {
  const { command, cwd, watch_dir, upload, ...rest } = rawBuild;
  const deprecatedUpload: DeprecatedUpload = { ...upload };
  validateAdditionalProperties(diagnostics, "build", Object.keys(rest), []);

  validateOptionalProperty(diagnostics, "build", "command", command, "string");
  validateOptionalProperty(diagnostics, "build", "cwd", cwd, "string");
  validateOptionalProperty(
    diagnostics,
    "build",
    "watch_dir",
    watch_dir,
    "string"
  );

  deprecated(
    diagnostics,
    rawEnv,
    "build.upload.format",
    "The format is inferred automatically from the code.",
    true
  );

  if (rawEnv.main !== undefined && rawBuild.upload?.main) {
    diagnostics.errors.push(
      `Don't define both the \`main\` and \`build.upload.main\` fields in your configuration.\n` +
        `They serve the same purpose: to point to the entry-point of your worker.\n` +
        `Delete the \`build.upload.main\` and \`build.upload.dir\` field from your config.`
    );
  } else {
    deprecated(
      diagnostics,
      rawEnv,
      "build.upload.main",
      `Delete the \`build.upload.main\` and \`build.upload.dir\` fields.\n` +
        `Then add the top level \`main\` field to your configuration file:\n` +
        `\`\`\`\n` +
        `main = "${path.join(
          rawBuild.upload?.dir ?? "./dist",
          rawBuild.upload?.main ?? "."
        )}"\n` +
        `\`\`\``,
      true
    );

    deprecated(
      diagnostics,
      rawEnv,
      "build.upload.dir",
      `Use the top level "main" field or a command-line argument to specify the entry-point for the Worker.`,
      true
    );
  }

  return {
    command,
    watch_dir:
      // - `watch_dir` only matters when `command` is defined, so we apply
      // a default only when `command` is defined
      // - `configPath` will always be defined since `build` can only
      // be configured in `wrangler.toml`, but who knows, that may
      // change in the future, so we do a check anyway
      command
        ? configPath
          ? path.relative(
              process.cwd(),
              path.join(path.dirname(configPath), watch_dir || "./src")
            )
          : watch_dir || "./src"
        : watch_dir,
    cwd,
    deprecatedUpload,
  };
}

/**
 * Validate the `main` field and return the normalized values.
 */
function normalizeAndValidateMainField(
  configPath: string | undefined,
  rawMain: string | undefined,
  deprecatedUpload: DeprecatedUpload | undefined
): string | undefined {
  const configDir = path.dirname(configPath ?? "wrangler.toml");
  if (rawMain !== undefined) {
    if (typeof rawMain === "string") {
      const directory = path.resolve(configDir);
      return path.resolve(directory, rawMain);
    } else {
      return rawMain;
    }
  } else if (deprecatedUpload?.main !== undefined) {
    const directory = path.resolve(
      configDir,
      deprecatedUpload?.dir || "./dist"
    );
    return path.resolve(directory, deprecatedUpload.main);
  } else {
    return;
  }
}

/**
 * Validate the `dev` configuration and return the normalized values.
 */
function normalizeAndValidateDev(
  diagnostics: Diagnostics,
  rawDev: RawDevConfig
): DevConfig {
  const {
    ip = "localhost",
    port = 8787,
    local_protocol = "http",
    upstream_protocol = "https",
    host,
    ...rest
  } = rawDev;
  validateAdditionalProperties(diagnostics, "dev", Object.keys(rest), []);

  validateOptionalProperty(diagnostics, "dev", "ip", ip, "string");
  validateOptionalProperty(diagnostics, "dev", "port", port, "number");
  validateOptionalProperty(
    diagnostics,
    "dev",
    "local_protocol",
    local_protocol,
    "string",
    ["http", "https"]
  );
  validateOptionalProperty(
    diagnostics,
    "dev",
    "upstream_protocol",
    upstream_protocol,
    "string",
    ["http", "https"]
  );
  validateOptionalProperty(diagnostics, "dev", "host", host, "string");
  return { ip, port, local_protocol, upstream_protocol, host };
}

/**
 * Validate the `migrations` configuration and return the normalized values.
 */
function normalizeAndValidateMigrations(
  diagnostics: Diagnostics,
  rawMigrations: Config["migrations"]
): Config["migrations"] {
  if (!Array.isArray(rawMigrations)) {
    diagnostics.errors.push(
      `The optional "migrations" field should be an array, but got ${JSON.stringify(
        rawMigrations
      )}`
    );
    return [];
  } else {
    for (let i = 0; i < rawMigrations.length; i++) {
      const migration = rawMigrations[i];
      validateRequiredProperty(
        diagnostics,
        `migrations[${i}]`,
        `tag`,
        migration.tag,
        "string"
      );
      validateOptionalTypedArray(
        diagnostics,
        `migrations[${i}].new_classes`,
        migration.new_classes,
        "string"
      );
      if (migration.renamed_classes !== undefined) {
        if (!Array.isArray(migration.renamed_classes)) {
          diagnostics.errors.push(
            `Expected "migrations[${i}].renamed_classes" to be an array of "{from: string, to: string}" objects but got ${JSON.stringify(
              migration.renamed_classes
            )}.`
          );
        } else if (
          migration.renamed_classes.some(
            (c) =>
              typeof c !== "object" ||
              !isRequiredProperty(c, "from", "string") ||
              !isRequiredProperty(c, "to", "string")
          )
        ) {
          diagnostics.errors.push(
            `Expected "migrations[${i}].renamed_classes" to be an array of "{from: string, to: string}" objects but got ${JSON.stringify(
              migration.renamed_classes
            )}.`
          );
        }
      }
      validateOptionalTypedArray(
        diagnostics,
        `migrations[${i}].deleted_classes`,
        migration.deleted_classes,
        "string"
      );
    }
    return rawMigrations;
  }
}

/**
 * Validate the `site` configuration and return the normalized values.
 */
function normalizeAndValidateSite(
  diagnostics: Diagnostics,
  rawSite: Config["site"]
): Config["site"] {
  if (rawSite !== undefined) {
    const { bucket, include = [], exclude = [], ...rest } = rawSite;
    validateAdditionalProperties(diagnostics, "site", Object.keys(rest), []);
    validateRequiredProperty(diagnostics, "site", "bucket", bucket, "string");
    validateTypedArray(diagnostics, "sites.include", include, "string");
    validateTypedArray(diagnostics, "sites.exclude", exclude, "string");
    return { bucket, include, exclude };
  }
  return undefined;
}

/**
 * Map the paths of the `wasm_modules` or `text_blobs` configuration to be relative to the current working directory.
 */
function normalizeAndValidateModulePaths(
  diagnostics: Diagnostics,
  configPath: string | undefined,
  field: "wasm_modules" | "text_blobs",
  rawMapping: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (rawMapping === undefined) {
    return undefined;
  }
  const mapping: Record<string, string> = {};
  // Rewrite paths to be relative to the cwd, rather than the config path.
  for (const [name, filePath] of Object.entries(rawMapping)) {
    if (isString(diagnostics, `${field}['${name}']`, filePath, undefined)) {
      if (configPath) {
        mapping[name] = configPath
          ? path.relative(
              process.cwd(),
              path.join(path.dirname(configPath), filePath)
            )
          : filePath;
      }
    }
  }
  return mapping;
}

/**
 * Validate top-level environment configuration and return the normalized values.
 */
function normalizeAndValidateEnvironment(
  diagnostics: Diagnostics,
  configPath: string | undefined,
  topLevelEnv: RawEnvironment
): Environment;
/**
 * Validate the named environment configuration and return the normalized values.
 */
function normalizeAndValidateEnvironment(
  diagnostics: Diagnostics,
  configPath: string | undefined,
  rawEnv: RawEnvironment,
  envName: string,
  topLevelEnv: Environment,
  isLegacyEnv: boolean,
  rawConfig: RawConfig
): Environment;
function normalizeAndValidateEnvironment(
  diagnostics: Diagnostics,
  configPath: string | undefined,
  rawEnv: RawEnvironment,
  envName = "top level",
  topLevelEnv?: Environment | undefined,
  isLegacyEnv?: boolean,
  rawConfig?: RawConfig | undefined
): Environment {
  deprecated(
    diagnostics,
    rawEnv,
    "zone_id",
    "This is unnecessary since we can deduce this from routes directly.",
    false // We need to leave this in-place for the moment since `route` commands might use it.
  );

  // The field "experimental_services" doesn't exist anymore in the config, but we still want to error about any older usage.
  // TODO: remove this before GA.
  deprecated(
    diagnostics,
    rawEnv,
    "experimental_services",
    `The "experimental_services" field is no longer supported. Instead, use [[unsafe.bindings]] to enable experimental features. Add this to your wrangler.toml:\n` +
      "```\n" +
      TOML.stringify({
        unsafe: {
          bindings: (rawEnv?.experimental_services || []).map(
            (serviceDefinition) => {
              return {
                name: serviceDefinition.name,
                type: "service",
                service: serviceDefinition.service,
                environment: serviceDefinition.environment,
              };
            }
          ),
        },
      }) +
      "```",
    true
  );

  experimental(diagnostics, rawEnv, "unsafe");

  const route = inheritable(
    diagnostics,
    topLevelEnv,
    rawEnv,
    "route",
    isString,
    undefined
  );
  const routes = inheritable(
    diagnostics,
    topLevelEnv,
    rawEnv,
    "routes",
    all(isStringArray, isMutuallyExclusiveWith(rawEnv, "route")),
    undefined
  );
  const workers_dev = inheritable(
    diagnostics,
    topLevelEnv,
    rawEnv,
    "workers_dev",
    isBoolean,
    !(routes || route)
  );

  const { deprecatedUpload, ...build } = normalizeAndValidateBuild(
    diagnostics,
    rawEnv,
    rawEnv.build ?? topLevelEnv?.build ?? {},
    configPath
  );

  const environment: Environment = {
    // Inherited fields
    account_id: inheritable(
      diagnostics,
      topLevelEnv,
      rawEnv,
      "account_id",
      isString,
      undefined
    ),
    compatibility_date: inheritable(
      diagnostics,
      topLevelEnv,
      rawEnv,
      "compatibility_date",
      isString,
      undefined
    ),
    compatibility_flags: inheritable(
      diagnostics,
      topLevelEnv,
      rawEnv,
      "compatibility_flags",
      isStringArray,
      []
    ),
    jsx_factory: inheritable(
      diagnostics,
      topLevelEnv,
      rawEnv,
      "jsx_factory",
      isString,
      "React.createElement"
    ),
    jsx_fragment: inheritable(
      diagnostics,
      topLevelEnv,
      rawEnv,
      "jsx_fragment",
      isString,
      "React.Fragment"
    ),
    rules: validateAndNormalizeRules(
      diagnostics,
      topLevelEnv,
      rawEnv,
      deprecatedUpload?.rules,
      envName
    ),
    name: inheritableInLegacyEnvironments(
      diagnostics,
      isLegacyEnv,
      topLevelEnv,
      rawEnv,
      "name",
      isString,
      undefined
    ),
    main: normalizeAndValidateMainField(
      configPath,
      inheritable(
        diagnostics,
        topLevelEnv,
        rawEnv,
        "main",
        isString,
        undefined
      ),
      deprecatedUpload
    ),
    route,
    routes,
    triggers: inheritable(
      diagnostics,
      topLevelEnv,
      rawEnv,
      "triggers",
      isObjectWith("crons"),
      { crons: [] }
    ),
    usage_model: inheritable(
      diagnostics,
      topLevelEnv,
      rawEnv,
      "usage_model",
      isOneOf("bundled", "unbound"),
      undefined
    ),
    build,
    workers_dev,
    // Not inherited fields
    vars: notInheritable(
      diagnostics,
      topLevelEnv,
      rawConfig,
      rawEnv,
      envName,
      "vars",
      validateVars(envName),
      {}
    ),
    durable_objects: notInheritable(
      diagnostics,
      topLevelEnv,
      rawConfig,
      rawEnv,
      envName,
      "durable_objects",
      validateBindingsProperty(envName, validateDurableObjectBinding),
      {
        bindings: [],
      }
    ),
    kv_namespaces: notInheritable(
      diagnostics,
      topLevelEnv,
      rawConfig,
      rawEnv,
      envName,
      "kv_namespaces",
      validateBindingArray(envName, validateKVBinding),
      []
    ),
    r2_buckets: notInheritable(
      diagnostics,
      topLevelEnv,
      rawConfig,
      rawEnv,
      envName,
      "r2_buckets",
      validateBindingArray(envName, validateR2Binding),
      []
    ),
    unsafe: notInheritable(
      diagnostics,
      topLevelEnv,
      rawConfig,
      rawEnv,
      envName,
      "unsafe",
      validateBindingsProperty(envName, validateUnsafeBinding),
      {
        bindings: [],
      }
    ),
    zone_id: rawEnv.zone_id,
  };

  return environment;
}

const validateAndNormalizeRules = (
  diagnostics: Diagnostics,
  topLevelEnv: Environment | undefined,
  rawEnv: RawEnvironment,
  deprecatedRules: Rule[] | undefined,
  envName: string
): Rule[] => {
  if (topLevelEnv === undefined) {
    // Only create errors/warnings for the top-level environment
    if (rawEnv.rules && deprecatedRules) {
      diagnostics.errors.push(
        `You cannot configure both [rules] and [build.upload.rules] in your wrangler.toml. Delete the \`build.upload\` section.`
      );
    } else if (deprecatedRules) {
      diagnostics.warnings.push(
        `DEPRECATION: The \`build.upload.rules\` config field is no longer used, the rules should be specified via the \`rules\` config field. Delete the \`build.upload\` field from the configuration file, and add this:\n` +
          "```\n" +
          TOML.stringify({ rules: deprecatedRules }) +
          "```"
      );
    }
  }

  return inheritable(
    diagnostics,
    topLevelEnv,
    rawEnv,
    "rules",
    validateRules(envName),
    deprecatedRules ?? []
  );
};

const validateRules =
  (envName: string): ValidatorFn =>
  (diagnostics, field, envValue, config) => {
    if (!envValue) {
      return true;
    }
    const fieldPath =
      config === undefined ? `${field}` : `env.${envName}.${field}`;
    if (!Array.isArray(envValue)) {
      diagnostics.errors.push(
        `The field "${fieldPath}" should be an array but got ${JSON.stringify(
          envValue
        )}.`
      );
      return false;
    }

    let isValid = true;
    for (let i = 0; i < envValue.length; i++) {
      isValid =
        validateRule(diagnostics, `${fieldPath}[${i}]`, envValue[i], config) &&
        isValid;
    }
    return isValid;
  };

const validateRule: ValidatorFn = (diagnostics, field, value) => {
  if (typeof value !== "object" || value === null) {
    diagnostics.errors.push(
      `"${field}" should be an object but got ${JSON.stringify(value)}.`
    );
    return false;
  }
  // Rules must have a type string and glob string array, and optionally a fallthrough boolean.
  let isValid = true;
  const rule = value as Rule;

  if (
    !isRequiredProperty(rule, "type", "string", [
      "ESModule",
      "CommonJS",
      "CompiledWasm",
      "Text",
      "Data",
    ])
  ) {
    diagnostics.errors.push(
      `bindings should have a string "type" field, which contains one of "ESModule", "CommonJS", "CompiledWasm", "Text", or "Data".`
    );
    isValid = false;
  }

  isValid =
    validateTypedArray(diagnostics, `${field}.globs`, rule.globs, "string") &&
    isValid;

  if (!isOptionalProperty(rule, "fallthrough", "boolean")) {
    diagnostics.errors.push(
      `binding should, optionally, have a boolean "fallthrough" field.`
    );
    isValid = false;
  }

  return isValid;
};

const validateVars =
  (envName: string): ValidatorFn =>
  (diagnostics, field, value, config) => {
    let isValid = true;
    const fieldPath =
      config === undefined ? `${field}` : `env.${envName}.${field}`;
    const configVars = Object.keys(config?.vars ?? {});
    // If there are no top level vars then there is nothing to do here.
    if (configVars.length > 0) {
      if (typeof value !== "object" || value === null) {
        diagnostics.errors.push(
          `The field "${fieldPath}" should be an object but got ${JSON.stringify(
            value
          )}.\n`
        );
        isValid = false;
      } else {
        for (const varName of configVars) {
          if (!(varName in value)) {
            diagnostics.warnings.push(
              `"vars.${varName}" exists at the top level, but not on "${fieldPath}".\n` +
                `This is not what you probably want, since "vars" configuration is not inherited by environments.\n` +
                `Please add "vars.${varName}" to "env.${envName}".`
            );
          }
        }
      }
    }
    return isValid;
  };

const validateBindingsProperty =
  (envName: string, validateBinding: ValidatorFn): ValidatorFn =>
  (diagnostics, field, value, config) => {
    let isValid = true;
    const fieldPath =
      config === undefined ? `${field}` : `env.${envName}.${field}`;

    if (value !== undefined) {
      // Check the validity of the `value` as a bindings container.
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        diagnostics.errors.push(
          `The field "${fieldPath}" should be an object but got ${JSON.stringify(
            value
          )}.`
        );
        isValid = false;
      } else if (!hasProperty(value, "bindings")) {
        diagnostics.errors.push(
          `The field "${fieldPath}" is missing the required "bindings" property.`
        );
        isValid = false;
      } else if (!Array.isArray(value.bindings)) {
        diagnostics.errors.push(
          `The field "${fieldPath}.bindings" should be an array but got ${JSON.stringify(
            value.bindings
          )}.`
        );
        isValid = false;
      } else {
        for (let i = 0; i < value.bindings.length; i++) {
          const binding = value.bindings[i];
          const bindingDiagnostics = new Diagnostics(
            `"${fieldPath}.bindings[${i}]": ${JSON.stringify(binding)}`
          );
          isValid =
            validateBinding(
              bindingDiagnostics,
              `${fieldPath}.bindings[${i}]`,
              binding,
              config
            ) && isValid;
          diagnostics.addChild(bindingDiagnostics);
        }
      }

      const configBindingNames = getBindingNames(
        config?.[field as keyof Environment]
      );
      if (isValid && configBindingNames.length > 0) {
        // If there are top level bindings then check that they all appear in the environment.
        const envBindingNames = new Set(getBindingNames(value));
        const missingBindings = configBindingNames.filter(
          (name) => !envBindingNames.has(name)
        );
        if (missingBindings.length > 0) {
          diagnostics.warnings.push(
            `The following bindings are at the top level, but not on "env.${envName}".\n` +
              `This is not what you probably want, since "${field}" configuration is not inherited by environments.\n` +
              `Please add a binding for each to "${fieldPath}.bindings".` +
              missingBindings.map((name) => `- ${name}`).join("\n")
          );
        }
      }
    }
    return isValid;
  };

/**
 * Get the names of the bindings collection in `value`.
 */
const getBindingNames = (value: unknown): string[] =>
  ((value as { bindings: { name: string }[] })?.bindings ?? []).map(
    (binding) => binding.name
  );

/**
 * Check that the given field is a valid "durable_object" binding object.
 */
const validateDurableObjectBinding: ValidatorFn = (
  diagnostics,
  field,
  value
) => {
  if (typeof value !== "object" || value === null) {
    diagnostics.errors.push(
      `Expected "${field}" to be an object but got ${JSON.stringify(value)}`
    );
    return false;
  }

  // Durable Object bindings must have a name and class_name, and optionally a script_name.
  let isValid = true;
  if (!isRequiredProperty(value, "name", "string")) {
    diagnostics.errors.push(`binding should have a string "name" field.`);
    isValid = false;
  }
  if (!isRequiredProperty(value, "class_name", "string")) {
    diagnostics.errors.push(`binding should have a string "class_name" field.`);
    isValid = false;
  }
  if (!isOptionalProperty(value, "script_name", "string")) {
    diagnostics.errors.push(
      `binding should, optionally, have a string "script_name" field.`
    );
    isValid = false;
  }

  return isValid;
};

/**
 * Check that the given field is a valid "unsafe" binding object.
 *
 * TODO: further validation of known unsafe bindings.
 */
const validateUnsafeBinding: ValidatorFn = (diagnostics, field, value) => {
  if (typeof value !== "object" || value === null) {
    diagnostics.errors.push(
      `Expected ${field} to be an object but got ${JSON.stringify(value)}.`
    );
    return false;
  }

  let isValid = true;
  // Unsafe bindings must have a name and type.
  if (!isRequiredProperty(value, "name", "string")) {
    diagnostics.errors.push(`binding should have a string "name" field.`);
    isValid = false;
  }
  if (isRequiredProperty(value, "type", "string")) {
    const safeBindings = [
      "plain_text",
      "json",
      "kv_namespace",
      "durable_object_namespace",
    ];

    if (safeBindings.includes(value.type)) {
      diagnostics.warnings.push(
        `The binding type "${value.type}" is directly supported by wrangler.\n` +
          `Consider migrating this unsafe binding to a format for '${value.type}' bindings that is supported by wrangler for optimal support.\n` +
          "For more details, see https://developers.cloudflare.com/workers/cli-wrangler/configuration"
      );
    }
  } else {
    diagnostics.errors.push(`binding should have a string "type" field.`);
    isValid = false;
  }
  return isValid;
};

/**
 * Check that the given environment field is a valid array of bindings.
 */
const validateBindingArray =
  (envName: string, validateBinding: ValidatorFn): ValidatorFn =>
  (diagnostics, field, envValue, config) => {
    if (envValue === undefined) {
      return true;
    }

    const fieldPath =
      config === undefined ? `${field}` : `env.${envName}.${field}`;
    if (!Array.isArray(envValue)) {
      diagnostics.errors.push(
        `The field "${fieldPath}" should be an array but got ${JSON.stringify(
          envValue
        )}.`
      );
      return false;
    }

    let isValid = true;
    for (let i = 0; i < envValue.length; i++) {
      isValid =
        validateBinding(
          diagnostics,
          `${fieldPath}[${i}]`,
          envValue[i],
          config
        ) && isValid;
    }
    const configValue = config?.[field as keyof Environment] as {
      binding: unknown;
    }[];
    if (Array.isArray(configValue)) {
      const configBindingNames = configValue.map((value) => value.binding);
      // If there are no top level bindings then there is nothing to do here.
      if (configBindingNames.length > 0) {
        const envBindingNames = new Set(envValue.map((value) => value.binding));
        for (const configBindingName of configBindingNames) {
          if (!envBindingNames.has(configBindingName)) {
            diagnostics.warnings.push(
              `There is a ${field} binding with name "${configBindingName}" at the top level, but not on "env.${envName}".\n` +
                `This is not what you probably want, since "${field}" configuration is not inherited by environments.\n` +
                `Please add a binding for "${configBindingName}" to "env.${envName}.${field}.bindings".`
            );
          }
        }
      }
    }
    return isValid;
  };

const validateKVBinding: ValidatorFn = (diagnostics, field, value) => {
  if (typeof value !== "object" || value === null) {
    diagnostics.errors.push(
      `"kv_namespaces" bindings should be objects, but got ${JSON.stringify(
        value
      )}`
    );
    return false;
  }
  let isValid = true;
  // KV bindings must have a binding and id.
  if (!isRequiredProperty(value, "binding", "string")) {
    diagnostics.errors.push(
      `"${field}" bindings should have a string "binding" field but got ${JSON.stringify(
        value
      )}.`
    );
    isValid = false;
  }
  if (!isRequiredProperty(value, "id", "string")) {
    diagnostics.errors.push(
      `"${field}" bindings should have a string "id" field but got ${JSON.stringify(
        value
      )}.`
    );
    isValid = false;
  }
  if (!isOptionalProperty(value, "preview_id", "string")) {
    diagnostics.errors.push(
      `"${field}" bindings should, optionally, have a string "preview_id" field but got ${JSON.stringify(
        value
      )}.`
    );
    isValid = false;
  }
  return isValid;
};

const validateR2Binding: ValidatorFn = (diagnostics, field, value) => {
  if (typeof value !== "object" || value === null) {
    diagnostics.errors.push(
      `"kv_namespaces" bindings should be objects, but got ${JSON.stringify(
        value
      )}`
    );
    return false;
  }
  let isValid = true;
  // R2 bindings must have a binding and bucket_name.
  if (!isRequiredProperty(value, "binding", "string")) {
    diagnostics.errors.push(
      `"${field}" bindings should have a string "binding" field but got ${JSON.stringify(
        value
      )}.`
    );
    isValid = false;
  }
  if (!isRequiredProperty(value, "bucket_name", "string")) {
    diagnostics.errors.push(
      `"${field}" bindings should have a string "bucket_name" field but got ${JSON.stringify(
        value
      )}.`
    );
    isValid = false;
  }
  if (!isOptionalProperty(value, "preview_bucket_name", "string")) {
    diagnostics.errors.push(
      `"${field}" bindings should, optionally, have a string "preview_bucket_name" field but got ${JSON.stringify(
        value
      )}.`
    );
    isValid = false;
  }
  return isValid;
};