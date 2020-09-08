import { bang, doubleNum } from "./bang";
import { innerFunc } from "./nested";

type Action = ReturnType<typeof doubleNum> | { readonly type: "RESET_COUNT" };

function func(param: Action): string {
  if (param.type === "SET_COUNT") return `Param: ${param.payload}`;
  return "Reset";
}

type T = [first: number];

const x: T = [21];

const action: Action = doubleNum(...x);

bang(action.payload);
console.log("root index", func({ type: "SET_COUNT", payload: x[0] }));
console.log("root index", func({ type: "RESET_COUNT" }));
console.log("inner from root index", innerFunc(x[0]));
