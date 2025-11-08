import { createBuilder } from "@angular-devkit/architect";
import {
  executeDevServerBuilder,
  buildApplication,
} from "@angular-devkit/build-angular";

const TH_ENV_PATTERN =
  /<th:block[^>]*th:insert="~\{fragments\s*::\s*env\}"[^>]*>\s*<\/th:block>/i;

const SERVER_ENV_URL = process.env.SERVER_ENV_URL ?? "http://localhost:8080/";

function indentScript(script) {
  return script
    .trim()
    .split(/\r?\n/)
    .map((line) => `    ${line}`)
    .join("\n");
}

let envScriptPromise;

async function loadEnvScript(logger) {
  if (!envScriptPromise) {
    envScriptPromise = (async () => {
      try {
        const response = await fetch(SERVER_ENV_URL, {
          headers: { Accept: "text/html" },
        });

        if (!response.ok) {
          throw new Error(`Unexpected status ${response.status}`);
        }

        return indentScript(await response.text());
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logger.error(
          `Unable to load environment script from ${SERVER_ENV_URL}. Reason: ${reason}`
        );
        throw error instanceof Error ? error : new Error(reason);
      }
    })().catch((error) => {
      envScriptPromise = undefined;
      throw error;
    });
  }

  return envScriptPromise;
}

function createIndexTransform(logger) {
  return async (content) => {
    if (!TH_ENV_PATTERN.test(content)) {
      logger.warn(
        "<th:block> environment fragment not found in index.html; leaving content unchanged."
      );
      return content;
    }

    const envScript = await loadEnvScript(logger);

    return content.replace(TH_ENV_PATTERN, envScript);
  };
}

export default createBuilder((options, context) => {
  const transform = createIndexTransform(context.logger);

  if (context.target?.target === "serve") {
    context.logger.info("Custom builder is running in serve mode.");

    return executeDevServerBuilder(
      options,
      context,
      { indexHtml: transform },
      { builderSelector: () => "@angular/build:application" }
    );
  }

  return buildApplication(options, context);
});
