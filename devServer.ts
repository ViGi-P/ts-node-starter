import watchman from "fb-watchman";
import { spawn } from "child_process";

const client = new watchman.Client();
const devServerSubscription = "dev_server_subscription";
let isUpdating = false;

function devServerStart() {
  const tsNode = spawn(
    `${process.cwd()}/node_modules/.bin/ts-node`,
    ["src/index.ts"],
  );

  tsNode.stdout.on("data", (data) => {
    if (isUpdating) process.stdout.write(`${data}`);
  });

  tsNode.stderr.on("data", (data) => {
    console.error(`Stderr: ${data}`);
  });

  tsNode.on("close", (code) => {
    if (isUpdating) {
      console.log("––––––––––––––––––––––––––––––––––––––––––––––––––");
      console.log(`Exited with code ${code}`);
      console.log("––––––––––––––––––––––––––––––––––––––––––––––––––");
    }
    isUpdating = false;
  });
}

function makeSubscription(
  client: watchman.Client,
  watch: string,
  relative_path: string | undefined,
) {
  const sub = {
    expression: ["dirname", "src"],
    fields: ["name", "size", "mtime_ms", "exists", "type"],
    ...(relative_path ? { relative_root: relative_path } : {}),
  };

  client.command(
    ["subscribe", watch, devServerSubscription, sub],
    (error, resp) => {
      if (error) {
        console.error("Failed to subscribe: ", error);
        return;
      }
      console.log(`Subscription added: ${resp.subscribe}`);
    },
  );

  client.on("subscription", (resp) => {
    if (resp.subscription !== devServerSubscription) return;

    isUpdating = true;

    if (!resp.is_fresh_instance) {
      console.group("File changed:");
      resp.files.forEach(function (file: any) {
        console.log(`${file.name}-${+file.mtime_ms}`);
      });
      console.groupEnd();
      console.log("––––––––––––––––––––––––––––––––––––––––––––––––––");
    } else {
      console.log("––––––––––––––––––––––––––––––––––––––––––––––––––");
      console.log("Subscribed to file changes in ./src");
      console.log("––––––––––––––––––––––––––––––––––––––––––––––––––");
    }

    devServerStart();
  });
}

function safeExit(successFlags: any[]) {
  if (successFlags.every((flag) => flag === true)) process.exit(0);
}

function cleanUpServer(this: watchman.Client, event: string) {
  const cleanupSuccessFlags: [
    unsubscribeSuccess: boolean,
    watchDelSuccess: boolean,
  ] = [false, false];
  console.log("\n" + event + " fired, cleaning up");

  this.command(
    ["unsubscribe", `${__dirname}`, devServerSubscription],
    (error, resp) => {
      if (error) {
        console.error("Failed to unsubscribe: ", error);
        return;
      }
      console.log(`Unsubscribed: ${resp.unsubscribe}`);
      cleanupSuccessFlags[0] = true;
      safeExit(cleanupSuccessFlags);
    },
  );

  this.command(["watch-del-all"], (err, res) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(`Watch deleted: ${res.roots}`);
    cleanupSuccessFlags[1] = true;
    safeExit(cleanupSuccessFlags);
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

        console.clear();
        if ("warning" in resp) console.log("warning:", resp.warning);
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
