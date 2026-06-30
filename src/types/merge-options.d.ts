// Type shim for merge-options v3.x
// The package ships types at index.d.ts but its package.json "exports" map
// is missing the "types" condition, so TypeScript cannot resolve it automatically.
// This declaration re-exports the correct types as a workaround.
declare module 'merge-options' {
  type Options = Record<string, unknown>;

  interface MergeOptions {
    <T extends Options>(...options: Array<Partial<T> | undefined>): T;
    call<T extends Options>(
      config: { concatArrays?: boolean; ignoreUndefined?: boolean },
      ...options: Array<Partial<T> | undefined>
    ): T;
  }

  const mergeOptions: MergeOptions;
  export = mergeOptions;
}
