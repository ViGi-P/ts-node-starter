export const doubleNum = (n: number) => {
  return {
    type: "SET_COUNT",
    payload: n * 2,
  } as const;
};

export function bang(arg: any) {
  console.log("bang bang bang bang bang bang bang bang bang bang", arg, "!");
}
