import watchman from "fb-watchman";
import { spawn } from "child_process";

const client = new watchman.Client();
const devServerSubscription = "dev_server_subscription";
const devSubState = "dev_subscription_state";
let isExecuting = false;
let isCleaningUp = false;

function devServerStart() {
  const tsNode = spawn(
    `${process.cwd()}/node_modules/.bin/ts-node`,
    ["src/index.ts"],
  );

  tsNode.stdout.on("data", (data) => {
    if (isExecuting) process.stdout.write(`${data}`);
  });

  tsNode.stderr.on("data", (data) => {
    console.error(`Stderr: ${data}`);
  });

  tsNode.on("close", (code) => {
    if (isExecuting) {
      console.log("\x1b[0m%s\x1b[0m", "");
      console.log(`Exited with code ${code}`);
    }
    isExecuting = false;
  });
}

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
      console.log(`Subscription added: ${resp.subscribe}`);
    },
  );

  client.on("subscription", (resp) => {
    if (resp.subscription !== devServerSubscription) return;

    if (!resp.is_fresh_instance) {
      if (!isExecuting) {
        console.log("");
        console.log("\x1b[36m%s", "Files changed. Restarting...");
        console.log("\x1b[97m%s\x1b[37m", "");
      }
    } else {
      console.log("Subscribed to file changes in ./src");
      console.log("");
      console.log("\x1b[36m%s", "Executing...");
      console.log("\x1b[97m%s\x1b[37m", "");
    }

    isExecuting = true;
    devServerStart();
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
