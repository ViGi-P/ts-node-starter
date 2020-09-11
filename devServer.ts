import watchman from "fb-watchman";
import debounce from "lodash.debounce";
import { promisify } from "util";
const spawn = promisify(require("child_process").exec);

const client = new watchman.Client();
const devServerSubscription = "dev_server_subscription";
const devSubState = "dev_subscription_state";
let isCleaningUp = false;

const devServerStart = debounce(async (resp: any) => {
  devServerStart.cancel();
  try {
    const { stdout, stderr } = await spawn(
      `${process.cwd()}/node_modules/.bin/ts-node src/index.ts`,
    );

    if (!resp.is_fresh_instance) {
      console.log(
        "\x1b[36m%s",
        resp.files.filter((file: any) => file.type === "f").reduce(
          (acc: string, next: any) => `${acc} ${next.name}`,
          "Changed:",
        ),
      );
    } else {
      console.log("\x1b[36m%s", "Subscribed to file changes in ./src");
    }

    console.log("\x1b[97m%s\x1b[37m", "");
    if (stdout.length) process.stdout.write(stdout);
    if (stderr.length) process.stderr.write(stderr);
  } catch (error) {
    console.error("error:", error);
  }
  console.log("\x1b[0m%s\x1b[0m", "");
}, 1000);

function makeSubscription(
  client: watchman.Client,
  watch: string,
  relative_path: string | undefined,
) {
  const sub = {
    defer: [devSubState],
    expression: ["dirname", "src"],
    fields: ["name", "size", "mtime_ms", "exists", "type"],
    ...(relative_path ? { relative_root: relative_path } : {}),
  };

  client.command(
    ["subscribe", watch, devServerSubscription, sub],
    (error, resp) => {
      if (error) {
        console.error("Failed to subscribe:", error);
        return;
      }
      console.log(`Subscription added: ${resp.subscribe}\n`);
    },
  );

  client.on("subscription", (resp: any) => {
    if (resp.subscription !== devServerSubscription) return;

    devServerStart(resp);
  });
}

function safeExit(client: watchman.Client, successFlags: any[]) {
  if (successFlags.every((flag) => flag === true)) {
    client.end();
    process.exit(0);
  }
}

function cleanUpServer(this: watchman.Client, event: string) {
  if (isCleaningUp) return;

  isCleaningUp = true;
  const cleanupSuccessFlags: [
    unsubscribeSuccess: boolean,
    watchDelSuccess: boolean,
  ] = [false, false];
  console.log("\n" + event + " fired, cleaning up");

  this.command(
    ["unsubscribe", `${__dirname}`, devServerSubscription],
    (error, resp) => {
      if (error) {
        console.error("Failed to unsubscribe:", error);
        return;
      }
      console.log(`Unsubscribed: ${resp.unsubscribe}`);
      cleanupSuccessFlags[0] = true;
      safeExit(this, cleanupSuccessFlags);
    },
  );

  this.command(["watch-del-all"], (err, res) => {
    if (err) {
      console.error("Failed to delete watch:", err);
      return;
    }
    console.log(`Watch deleted: ${res.roots}`);
    cleanupSuccessFlags[1] = true;
    safeExit(this, cleanupSuccessFlags);
  });
}

client.capabilityCheck(
  { optional: [], required: ["relative_root"] },
  (error) => {
    if (error) {
      console.error(error);
      client.end();
      return;
    }

    client.command(
      ["watch-project", `${__dirname}`],
      (error, resp) => {
        if (error) {
          console.error("Watch failed:", error);
          return;
        }

        process.stdout.write("\u001b[3J\u001b[2J\u001b[1J");
        console.clear();
        if ("warning" in resp) {
          console.log("Warning:", resp.warning);
        }
        console.log(`Watch added: ${resp.watch}`);
        makeSubscription(client, resp.watch, resp.relative_path);
      },
    );
  },
);

["SIGINT", "SIGUSR1", "SIGUSR2", "SIGTERM"]
  .forEach((eventType) => {
    process.on(eventType, cleanUpServer.bind(client, eventType));
  });
