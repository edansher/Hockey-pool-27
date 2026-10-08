import type { TransactionInput, TransactionPreview } from "./generated/api.schemas";
export interface SwapStorage {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
}
type Attempt = {
    key: string;
    body: TransactionInput;
};
type StateSetter<T> = (value: T | ((previous: T) => T)) => void;
export interface SwapHooks {
    useState<T>(initial: T): [T, StateSetter<T>];
    useRef<T>(initial: T): {
        current: T;
    };
    useEffect(effect: () => void | (() => void), dependencies: unknown[]): void;
}
/** The request key AND body survive uncertain responses and app restarts. */
export declare function useParticipantSwap(hooks: SwapHooks, accountId: string | null | undefined, storage: SwapStorage, makeKey: () => string): {
    access: import("@tanstack/react-query").UseQueryResult<import(".").TransactionAccess, Error>;
    available: import("@tanstack/react-query").UseQueryResult<import(".").AvailablePlayersSnapshot, import("./custom-fetch").ErrorType<unknown>> & {
        queryKey: import("@tanstack/react-query").QueryKey;
    };
    pickups: import(".").AvailablePlayer[];
    attempt: Attempt | null;
    ready: boolean;
    busy: boolean;
    message: string;
    preview: TransactionPreview | null;
    review: (body: TransactionInput) => Promise<boolean>;
    submit: (body: TransactionInput) => Promise<void>;
};
export {};
//# sourceMappingURL=participant-swap.d.ts.map