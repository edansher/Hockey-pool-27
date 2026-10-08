import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { AdminAccess, AdminParticipantEmail, AvailablePlayersSnapshot, ClaimPoolPollPopup200, DailyAnalysis, DailyPoolPolls, DailyReportHealth, DailyReportHistoryItem, DailyReportResponse, DailyScoringRow, Dashboard, DraftRoster, GetAdminManagement200, GetAdminPoolPolls200, GetAuthConfig200, GetPlayersParams, GetStandingsParams, HealthStatus, ImportSelection, ImportSelectionUpdate, ManagePool200, NhlSourceSnapshot, OwnerDetail, OwnerStanding, ParticipantAccess, PlayerProfile, PlayerSummary, PoolInjurySnapshot, PoolManagementInput, PoolPoll, PoolPollDraft, PoolPollPublication, PoolPollRemoval, PoolPollRemovalResult, PoolPollSubmission, PoolScoringSnapshot, PublicShare, ScoringRules, ScoringRulesUpdate, ShareInput, ShareLink, StandingsSnapshot, Transaction, TransactionAccess, TransactionInput, TransactionPaymentUpdate, TransactionPreview, TransactionSummary } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getGetDailyPoolPollsUrl: () => string;
export declare const getDailyPoolPolls: (options?: Parameters<typeof customFetch>[1]) => Promise<DailyPoolPolls>;
export declare const getGetDailyPoolPollsQueryKey: () => readonly ["/api/poll/daily"];
export declare const getGetDailyPoolPollsQueryOptions: <TData = Awaited<ReturnType<typeof getDailyPoolPolls>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDailyPoolPolls>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDailyPoolPolls>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDailyPoolPollsQueryResult = NonNullable<Awaited<ReturnType<typeof getDailyPoolPolls>>>;
export type GetDailyPoolPollsQueryError = ErrorType<unknown>;
export declare function useGetDailyPoolPolls<TData = Awaited<ReturnType<typeof getDailyPoolPolls>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDailyPoolPolls>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getClaimPoolPollPopupUrl: () => string;
export declare const claimPoolPollPopup: (options?: Parameters<typeof customFetch>[1]) => Promise<ClaimPoolPollPopup200>;
export declare const getClaimPoolPollPopupMutationKey: () => readonly ["claimPoolPollPopup"];
export declare const getClaimPoolPollPopupMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof claimPoolPollPopup>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof claimPoolPollPopup>>, TError, void, TContext>;
export type ClaimPoolPollPopupMutationResult = NonNullable<Awaited<ReturnType<typeof claimPoolPollPopup>>>;
export type ClaimPoolPollPopupMutationError = ErrorType<unknown>;
export declare const useClaimPoolPollPopup: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof claimPoolPollPopup>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof claimPoolPollPopup>>, TError, void, TContext>;
export declare const getGetAdminPoolPollsUrl: () => string;
export declare const getAdminPoolPolls: (options?: Parameters<typeof customFetch>[1]) => Promise<GetAdminPoolPolls200>;
export declare const getGetAdminPoolPollsQueryKey: () => readonly ["/api/poll/admin"];
export declare const getGetAdminPoolPollsQueryOptions: <TData = Awaited<ReturnType<typeof getAdminPoolPolls>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminPoolPolls>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAdminPoolPolls>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAdminPoolPollsQueryResult = NonNullable<Awaited<ReturnType<typeof getAdminPoolPolls>>>;
export type GetAdminPoolPollsQueryError = ErrorType<unknown>;
export declare function useGetAdminPoolPolls<TData = Awaited<ReturnType<typeof getAdminPoolPolls>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminPoolPolls>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getSavePoolPollDraftUrl: () => string;
export declare const savePoolPollDraft: (poolPollDraft: PoolPollDraft, options?: Parameters<typeof customFetch>[1]) => Promise<PoolPoll>;
export declare const getSavePoolPollDraftMutationKey: () => readonly ["savePoolPollDraft"];
export declare const getSavePoolPollDraftMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof savePoolPollDraft>>, TError, SavePoolPollDraftMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof savePoolPollDraft>>, TError, SavePoolPollDraftMutationVariables, TContext>;
export type SavePoolPollDraftMutationResult = NonNullable<Awaited<ReturnType<typeof savePoolPollDraft>>>;
export type SavePoolPollDraftMutationBody = BodyType<PoolPollDraft>;
export type SavePoolPollDraftMutationError = ErrorType<unknown>;
export type SavePoolPollDraftMutationVariables = {
    data: BodyType<PoolPollDraft>;
};
export declare const useSavePoolPollDraft: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof savePoolPollDraft>>, TError, SavePoolPollDraftMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof savePoolPollDraft>>, TError, SavePoolPollDraftMutationVariables, TContext>;
export declare const getPreviewPoolPollUrl: () => string;
export declare const previewPoolPoll: (poolPollDraft: PoolPollDraft, options?: Parameters<typeof customFetch>[1]) => Promise<PoolPoll>;
export declare const getPreviewPoolPollMutationKey: () => readonly ["previewPoolPoll"];
export declare const getPreviewPoolPollMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof previewPoolPoll>>, TError, PreviewPoolPollMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof previewPoolPoll>>, TError, PreviewPoolPollMutationVariables, TContext>;
export type PreviewPoolPollMutationResult = NonNullable<Awaited<ReturnType<typeof previewPoolPoll>>>;
export type PreviewPoolPollMutationBody = BodyType<PoolPollDraft>;
export type PreviewPoolPollMutationError = ErrorType<unknown>;
export type PreviewPoolPollMutationVariables = {
    data: BodyType<PoolPollDraft>;
};
export declare const usePreviewPoolPoll: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof previewPoolPoll>>, TError, PreviewPoolPollMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof previewPoolPoll>>, TError, PreviewPoolPollMutationVariables, TContext>;
export declare const getUpdatePoolPollUrl: () => string;
export declare const updatePoolPoll: (poolPollDraft: PoolPollDraft, options?: Parameters<typeof customFetch>[1]) => Promise<PoolPoll>;
export declare const getUpdatePoolPollMutationKey: () => readonly ["updatePoolPoll"];
export declare const getUpdatePoolPollMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updatePoolPoll>>, TError, UpdatePoolPollMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updatePoolPoll>>, TError, UpdatePoolPollMutationVariables, TContext>;
export type UpdatePoolPollMutationResult = NonNullable<Awaited<ReturnType<typeof updatePoolPoll>>>;
export type UpdatePoolPollMutationBody = BodyType<PoolPollDraft>;
export type UpdatePoolPollMutationError = ErrorType<unknown>;
export type UpdatePoolPollMutationVariables = {
    data: BodyType<PoolPollDraft>;
};
export declare const useUpdatePoolPoll: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updatePoolPoll>>, TError, UpdatePoolPollMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updatePoolPoll>>, TError, UpdatePoolPollMutationVariables, TContext>;
export declare const getDeletePoolPollUrl: () => string;
export declare const deletePoolPoll: (poolPollRemoval: PoolPollRemoval, options?: Parameters<typeof customFetch>[1]) => Promise<PoolPollRemovalResult>;
export declare const getDeletePoolPollMutationKey: () => readonly ["deletePoolPoll"];
export declare const getDeletePoolPollMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deletePoolPoll>>, TError, DeletePoolPollMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deletePoolPoll>>, TError, DeletePoolPollMutationVariables, TContext>;
export type DeletePoolPollMutationResult = NonNullable<Awaited<ReturnType<typeof deletePoolPoll>>>;
export type DeletePoolPollMutationBody = BodyType<PoolPollRemoval>;
export type DeletePoolPollMutationError = ErrorType<unknown>;
export type DeletePoolPollMutationVariables = {
    data: BodyType<PoolPollRemoval>;
};
export declare const useDeletePoolPoll: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deletePoolPoll>>, TError, DeletePoolPollMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deletePoolPoll>>, TError, DeletePoolPollMutationVariables, TContext>;
export declare const getPublishPoolPollUrl: () => string;
export declare const publishPoolPoll: (poolPollPublication: PoolPollPublication, options?: Parameters<typeof customFetch>[1]) => Promise<PoolPoll>;
export declare const getPublishPoolPollMutationKey: () => readonly ["publishPoolPoll"];
export declare const getPublishPoolPollMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof publishPoolPoll>>, TError, PublishPoolPollMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof publishPoolPoll>>, TError, PublishPoolPollMutationVariables, TContext>;
export type PublishPoolPollMutationResult = NonNullable<Awaited<ReturnType<typeof publishPoolPoll>>>;
export type PublishPoolPollMutationBody = BodyType<PoolPollPublication>;
export type PublishPoolPollMutationError = ErrorType<unknown>;
export type PublishPoolPollMutationVariables = {
    data: BodyType<PoolPollPublication>;
};
export declare const usePublishPoolPoll: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof publishPoolPoll>>, TError, PublishPoolPollMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof publishPoolPoll>>, TError, PublishPoolPollMutationVariables, TContext>;
export declare const getGetPoolPollUrl: () => string;
/**
 * @summary Current participant poll and live anonymous aggregate results
 */
export declare const getPoolPoll: (options?: Parameters<typeof customFetch>[1]) => Promise<PoolPoll>;
export declare const getGetPoolPollQueryKey: () => readonly ["/api/poll"];
export declare const getGetPoolPollQueryOptions: <TData = Awaited<ReturnType<typeof getPoolPoll>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPoolPoll>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPoolPoll>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPoolPollQueryResult = NonNullable<Awaited<ReturnType<typeof getPoolPoll>>>;
export type GetPoolPollQueryError = ErrorType<unknown>;
/**
 * @summary Current participant poll and live anonymous aggregate results
 */
export declare function useGetPoolPoll<TData = Awaited<ReturnType<typeof getPoolPoll>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPoolPoll>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getSubmitPoolPollUrl: () => string;
/**
 * @summary Submit one complete response per verified linked participant
 */
export declare const submitPoolPoll: (poolPollSubmission: PoolPollSubmission, options?: Parameters<typeof customFetch>[1]) => Promise<PoolPoll>;
export declare const getSubmitPoolPollMutationKey: () => readonly ["submitPoolPoll"];
export declare const getSubmitPoolPollMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof submitPoolPoll>>, TError, SubmitPoolPollMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof submitPoolPoll>>, TError, SubmitPoolPollMutationVariables, TContext>;
export type SubmitPoolPollMutationResult = NonNullable<Awaited<ReturnType<typeof submitPoolPoll>>>;
export type SubmitPoolPollMutationBody = BodyType<PoolPollSubmission>;
export type SubmitPoolPollMutationError = ErrorType<void>;
export type SubmitPoolPollMutationVariables = {
    data: BodyType<PoolPollSubmission>;
};
/**
* @summary Submit one complete response per verified linked participant
*/
export declare const useSubmitPoolPoll: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof submitPoolPoll>>, TError, SubmitPoolPollMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof submitPoolPoll>>, TError, SubmitPoolPollMutationVariables, TContext>;
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: Parameters<typeof customFetch>[1]) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetNhlSourceUrl: () => string;
/**
 * Server refreshes official NHL scores and eligible game statistics every five minutes. Returns persisted source facts, not calculated pool points. Failed updates retain the last successful snapshot and explicitly mark it stale.
 * @summary Official NHL scores and source refresh status
 */
export declare const getNhlSource: (options?: Parameters<typeof customFetch>[1]) => Promise<NhlSourceSnapshot>;
export declare const getGetNhlSourceQueryKey: () => readonly ["/api/nhl-source"];
export declare const getGetNhlSourceQueryOptions: <TData = Awaited<ReturnType<typeof getNhlSource>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getNhlSource>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getNhlSource>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetNhlSourceQueryResult = NonNullable<Awaited<ReturnType<typeof getNhlSource>>>;
export type GetNhlSourceQueryError = ErrorType<unknown>;
/**
 * @summary Official NHL scores and source refresh status
 */
export declare function useGetNhlSource<TData = Awaited<ReturnType<typeof getNhlSource>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getNhlSource>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDashboardUrl: () => string;
/**
 * @summary Current pool dashboard
 */
export declare const getDashboard: (options?: Parameters<typeof customFetch>[1]) => Promise<Dashboard>;
export declare const getGetDashboardQueryKey: () => readonly ["/api/dashboard"];
export declare const getGetDashboardQueryOptions: <TData = Awaited<ReturnType<typeof getDashboard>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboard>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDashboard>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDashboardQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboard>>>;
export type GetDashboardQueryError = ErrorType<unknown>;
/**
 * @summary Current pool dashboard
 */
export declare function useGetDashboard<TData = Awaited<ReturnType<typeof getDashboard>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboard>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetPoolScoringUrl: () => string;
/**
 * Returns stable owner/round rows for the 2026–27 regular season. Statistics are derived from official NHL gamecenter boxscores and play-by-play using the persisted current pool scoring rules. Incomplete source coverage is explicitly represented; unavailable values are null, never inferred zeroes.
 * @summary Persisted live NHL-to-pool scoring snapshot
 */
export declare const getPoolScoring: (options?: Parameters<typeof customFetch>[1]) => Promise<PoolScoringSnapshot>;
export declare const getGetPoolScoringQueryKey: () => readonly ["/api/pool-scoring"];
export declare const getGetPoolScoringQueryOptions: <TData = Awaited<ReturnType<typeof getPoolScoring>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPoolScoring>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPoolScoring>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPoolScoringQueryResult = NonNullable<Awaited<ReturnType<typeof getPoolScoring>>>;
export type GetPoolScoringQueryError = ErrorType<unknown>;
/**
 * @summary Persisted live NHL-to-pool scoring snapshot
 */
export declare function useGetPoolScoring<TData = Awaited<ReturnType<typeof getPoolScoring>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPoolScoring>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetPoolInjuriesUrl: () => string;
/**
 * Refreshed daily at 8 AM America/Toronto from official NHL sources. Unknown identities and unreported injuries remain explicit; absence and roster activity are not injury evidence.
 * @summary Current NHL injury reports for all identified pool players
 */
export declare const getPoolInjuries: (options?: Parameters<typeof customFetch>[1]) => Promise<PoolInjurySnapshot>;
export declare const getGetPoolInjuriesQueryKey: () => readonly ["/api/pool-injuries"];
export declare const getGetPoolInjuriesQueryOptions: <TData = Awaited<ReturnType<typeof getPoolInjuries>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPoolInjuries>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPoolInjuries>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPoolInjuriesQueryResult = NonNullable<Awaited<ReturnType<typeof getPoolInjuries>>>;
export type GetPoolInjuriesQueryError = ErrorType<unknown>;
/**
 * @summary Current NHL injury reports for all identified pool players
 */
export declare function useGetPoolInjuries<TData = Awaited<ReturnType<typeof getPoolInjuries>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPoolInjuries>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetStandingsUrl: (params?: GetStandingsParams) => string;
/**
 * @summary Standings for the current or selected Toronto calendar date
 */
export declare const getStandings: (params?: GetStandingsParams, options?: Parameters<typeof customFetch>[1]) => Promise<StandingsSnapshot>;
export declare const getGetStandingsQueryKey: (params?: GetStandingsParams) => readonly ["/api/standings", ...GetStandingsParams[]];
export declare const getGetStandingsQueryOptions: <TData = Awaited<ReturnType<typeof getStandings>>, TError = ErrorType<unknown>>(params?: GetStandingsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getStandings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getStandings>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetStandingsQueryResult = NonNullable<Awaited<ReturnType<typeof getStandings>>>;
export type GetStandingsQueryError = ErrorType<unknown>;
/**
 * @summary Standings for the current or selected Toronto calendar date
 */
export declare function useGetStandings<TData = Awaited<ReturnType<typeof getStandings>>, TError = ErrorType<unknown>>(params?: GetStandingsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getStandings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetOwnersUrl: () => string;
/**
 * @summary List pool owners and current summary totals
 */
export declare const getOwners: (options?: Parameters<typeof customFetch>[1]) => Promise<OwnerStanding[]>;
export declare const getGetOwnersQueryKey: () => readonly ["/api/owners"];
export declare const getGetOwnersQueryOptions: <TData = Awaited<ReturnType<typeof getOwners>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getOwners>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getOwners>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetOwnersQueryResult = NonNullable<Awaited<ReturnType<typeof getOwners>>>;
export type GetOwnersQueryError = ErrorType<unknown>;
/**
 * @summary List pool owners and current summary totals
 */
export declare function useGetOwners<TData = Awaited<ReturnType<typeof getOwners>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getOwners>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDraftRostersUrl: () => string;
/**
 * @summary Imported original draft-board selections
 */
export declare const getDraftRosters: (options?: Parameters<typeof customFetch>[1]) => Promise<DraftRoster[]>;
export declare const getGetDraftRostersQueryKey: () => readonly ["/api/draft-rosters"];
export declare const getGetDraftRostersQueryOptions: <TData = Awaited<ReturnType<typeof getDraftRosters>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDraftRosters>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDraftRosters>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDraftRostersQueryResult = NonNullable<Awaited<ReturnType<typeof getDraftRosters>>>;
export type GetDraftRostersQueryError = ErrorType<unknown>;
/**
 * @summary Imported original draft-board selections
 */
export declare function useGetDraftRosters<TData = Awaited<ReturnType<typeof getDraftRosters>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDraftRosters>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetOwnerUrl: (ownerId: string) => string;
/**
 * @summary Owner roster and season summary
 */
export declare const getOwner: (ownerId: string, options?: Parameters<typeof customFetch>[1]) => Promise<OwnerDetail>;
export declare const getGetOwnerQueryKey: (ownerId: string) => readonly [`/api/owners/${string}`];
export declare const getGetOwnerQueryOptions: <TData = Awaited<ReturnType<typeof getOwner>>, TError = ErrorType<void>>(ownerId: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getOwner>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getOwner>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetOwnerQueryResult = NonNullable<Awaited<ReturnType<typeof getOwner>>>;
export type GetOwnerQueryError = ErrorType<void>;
/**
 * @summary Owner roster and season summary
 */
export declare function useGetOwner<TData = Awaited<ReturnType<typeof getOwner>>, TError = ErrorType<void>>(ownerId: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getOwner>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetPlayersUrl: (params?: GetPlayersParams) => string;
/**
 * @summary Search the NHL player pool, including undrafted players
 */
export declare const getPlayers: (params?: GetPlayersParams, options?: Parameters<typeof customFetch>[1]) => Promise<PlayerSummary[]>;
export declare const getGetPlayersQueryKey: (params?: GetPlayersParams) => readonly ["/api/players", ...GetPlayersParams[]];
export declare const getGetPlayersQueryOptions: <TData = Awaited<ReturnType<typeof getPlayers>>, TError = ErrorType<unknown>>(params?: GetPlayersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPlayers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPlayers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPlayersQueryResult = NonNullable<Awaited<ReturnType<typeof getPlayers>>>;
export type GetPlayersQueryError = ErrorType<unknown>;
/**
 * @summary Search the NHL player pool, including undrafted players
 */
export declare function useGetPlayers<TData = Awaited<ReturnType<typeof getPlayers>>, TError = ErrorType<unknown>>(params?: GetPlayersParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPlayers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetAvailablePlayersUrl: () => string;
/**
 * Includes individual skaters and goalies. Points are calculated from verified per-game NHL facts using the currently saved pool scoring rules; incomplete rows are ranked by known points and explicitly marked.
 * @summary All undrafted NHL players ranked by current pool scoring rules
 */
export declare const getAvailablePlayers: (options?: Parameters<typeof customFetch>[1]) => Promise<AvailablePlayersSnapshot>;
export declare const getGetAvailablePlayersQueryKey: () => readonly ["/api/available-players"];
export declare const getGetAvailablePlayersQueryOptions: <TData = Awaited<ReturnType<typeof getAvailablePlayers>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAvailablePlayers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAvailablePlayers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAvailablePlayersQueryResult = NonNullable<Awaited<ReturnType<typeof getAvailablePlayers>>>;
export type GetAvailablePlayersQueryError = ErrorType<unknown>;
/**
 * @summary All undrafted NHL players ranked by current pool scoring rules
 */
export declare function useGetAvailablePlayers<TData = Awaited<ReturnType<typeof getAvailablePlayers>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAvailablePlayers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetPlayerUrl: (playerId: string) => string;
/**
 * @summary Player profile, game log, ownership and transaction history
 */
export declare const getPlayer: (playerId: string, options?: Parameters<typeof customFetch>[1]) => Promise<PlayerProfile>;
export declare const getGetPlayerQueryKey: (playerId: string) => readonly [`/api/players/${string}`];
export declare const getGetPlayerQueryOptions: <TData = Awaited<ReturnType<typeof getPlayer>>, TError = ErrorType<void>>(playerId: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPlayer>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPlayer>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPlayerQueryResult = NonNullable<Awaited<ReturnType<typeof getPlayer>>>;
export type GetPlayerQueryError = ErrorType<void>;
/**
 * @summary Player profile, game log, ownership and transaction history
 */
export declare function useGetPlayer<TData = Awaited<ReturnType<typeof getPlayer>>, TError = ErrorType<void>>(playerId: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPlayer>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetTransactionAccessUrl: () => string;
/**
 * @summary Current verified account's authorized rosters and active skaters, without email mappings
 */
export declare const getTransactionAccess: (options?: Parameters<typeof customFetch>[1]) => Promise<TransactionAccess>;
export declare const getGetTransactionAccessQueryKey: () => readonly ["/api/transaction-access"];
export declare const getGetTransactionAccessQueryOptions: <TData = Awaited<ReturnType<typeof getTransactionAccess>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTransactionAccess>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getTransactionAccess>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetTransactionAccessQueryResult = NonNullable<Awaited<ReturnType<typeof getTransactionAccess>>>;
export type GetTransactionAccessQueryError = ErrorType<unknown>;
/**
 * @summary Current verified account's authorized rosters and active skaters, without email mappings
 */
export declare function useGetTransactionAccess<TData = Awaited<ReturnType<typeof getTransactionAccess>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTransactionAccess>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetTransactionSummaryUrl: () => string;
/**
 * @summary Backend-calculated pool earnings and participant transaction counters
 */
export declare const getTransactionSummary: (options?: Parameters<typeof customFetch>[1]) => Promise<TransactionSummary>;
export declare const getGetTransactionSummaryQueryKey: () => readonly ["/api/transaction-summary"];
export declare const getGetTransactionSummaryQueryOptions: <TData = Awaited<ReturnType<typeof getTransactionSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTransactionSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getTransactionSummary>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetTransactionSummaryQueryResult = NonNullable<Awaited<ReturnType<typeof getTransactionSummary>>>;
export type GetTransactionSummaryQueryError = ErrorType<unknown>;
/**
 * @summary Backend-calculated pool earnings and participant transaction counters
 */
export declare function useGetTransactionSummary<TData = Awaited<ReturnType<typeof getTransactionSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTransactionSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateTransactionPaymentUrl: (id: string) => string;
/**
 * @summary Administrator records or corrects receipt of a completed drop fee
 */
export declare const updateTransactionPayment: (id: string, transactionPaymentUpdate: TransactionPaymentUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<Transaction>;
export declare const getUpdateTransactionPaymentMutationKey: () => readonly ["updateTransactionPayment"];
export declare const getUpdateTransactionPaymentMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTransactionPayment>>, TError, UpdateTransactionPaymentMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateTransactionPayment>>, TError, UpdateTransactionPaymentMutationVariables, TContext>;
export type UpdateTransactionPaymentMutationResult = NonNullable<Awaited<ReturnType<typeof updateTransactionPayment>>>;
export type UpdateTransactionPaymentMutationBody = BodyType<TransactionPaymentUpdate>;
export type UpdateTransactionPaymentMutationError = ErrorType<void>;
export type UpdateTransactionPaymentMutationVariables = {
    id: string;
    data: BodyType<TransactionPaymentUpdate>;
};
/**
* @summary Administrator records or corrects receipt of a completed drop fee
*/
export declare const useUpdateTransactionPayment: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTransactionPayment>>, TError, UpdateTransactionPaymentMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateTransactionPayment>>, TError, UpdateTransactionPaymentMutationVariables, TContext>;
export declare const getGetTransactionsUrl: () => string;
/**
 * @summary Immutable transaction history
 */
export declare const getTransactions: (options?: Parameters<typeof customFetch>[1]) => Promise<Transaction[]>;
export declare const getGetTransactionsQueryKey: () => readonly ["/api/transactions"];
export declare const getGetTransactionsQueryOptions: <TData = Awaited<ReturnType<typeof getTransactions>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTransactions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getTransactions>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetTransactionsQueryResult = NonNullable<Awaited<ReturnType<typeof getTransactions>>>;
export type GetTransactionsQueryError = ErrorType<unknown>;
/**
 * @summary Immutable transaction history
 */
export declare function useGetTransactions<TData = Awaited<ReturnType<typeof getTransactions>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTransactions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateTransactionUrl: () => string;
/**
 * @summary Atomically record a skater drop/pickup; goalies cannot be dropped or traded
 */
export declare const createTransaction: (transactionInput: TransactionInput, options?: Parameters<typeof customFetch>[1]) => Promise<Transaction>;
export declare const getCreateTransactionMutationKey: () => readonly ["createTransaction"];
export declare const getCreateTransactionMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createTransaction>>, TError, CreateTransactionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createTransaction>>, TError, CreateTransactionMutationVariables, TContext>;
export type CreateTransactionMutationResult = NonNullable<Awaited<ReturnType<typeof createTransaction>>>;
export type CreateTransactionMutationBody = BodyType<TransactionInput>;
export type CreateTransactionMutationError = ErrorType<void>;
export type CreateTransactionMutationVariables = {
    data: BodyType<TransactionInput>;
};
/**
* @summary Atomically record a skater drop/pickup; goalies cannot be dropped or traded
*/
export declare const useCreateTransaction: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createTransaction>>, TError, CreateTransactionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createTransaction>>, TError, CreateTransactionMutationVariables, TContext>;
export declare const getPreviewTransactionUrl: () => string;
export declare const previewTransaction: (transactionInput: TransactionInput, options?: Parameters<typeof customFetch>[1]) => Promise<TransactionPreview>;
export declare const getPreviewTransactionMutationKey: () => readonly ["previewTransaction"];
export declare const getPreviewTransactionMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof previewTransaction>>, TError, PreviewTransactionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof previewTransaction>>, TError, PreviewTransactionMutationVariables, TContext>;
export type PreviewTransactionMutationResult = NonNullable<Awaited<ReturnType<typeof previewTransaction>>>;
export type PreviewTransactionMutationBody = BodyType<TransactionInput>;
export type PreviewTransactionMutationError = ErrorType<void>;
export type PreviewTransactionMutationVariables = {
    data: BodyType<TransactionInput>;
};
export declare const usePreviewTransaction: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof previewTransaction>>, TError, PreviewTransactionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof previewTransaction>>, TError, PreviewTransactionMutationVariables, TContext>;
export declare const getGetAuthConfigUrl: () => string;
export declare const getAuthConfig: (options?: Parameters<typeof customFetch>[1]) => Promise<GetAuthConfig200>;
export declare const getGetAuthConfigQueryKey: () => readonly ["/api/auth/config"];
export declare const getGetAuthConfigQueryOptions: <TData = Awaited<ReturnType<typeof getAuthConfig>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAuthConfig>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAuthConfig>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAuthConfigQueryResult = NonNullable<Awaited<ReturnType<typeof getAuthConfig>>>;
export type GetAuthConfigQueryError = ErrorType<unknown>;
export declare function useGetAuthConfig<TData = Awaited<ReturnType<typeof getAuthConfig>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAuthConfig>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetAdminManagementUrl: () => string;
export declare const getAdminManagement: (options?: Parameters<typeof customFetch>[1]) => Promise<GetAdminManagement200>;
export declare const getGetAdminManagementQueryKey: () => readonly ["/api/admin/manage"];
export declare const getGetAdminManagementQueryOptions: <TData = Awaited<ReturnType<typeof getAdminManagement>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminManagement>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAdminManagement>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAdminManagementQueryResult = NonNullable<Awaited<ReturnType<typeof getAdminManagement>>>;
export type GetAdminManagementQueryError = ErrorType<void>;
export declare function useGetAdminManagement<TData = Awaited<ReturnType<typeof getAdminManagement>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminManagement>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getManagePoolUrl: () => string;
export declare const managePool: (poolManagementInput: PoolManagementInput, options?: Parameters<typeof customFetch>[1]) => Promise<ManagePool200>;
export declare const getManagePoolMutationKey: () => readonly ["managePool"];
export declare const getManagePoolMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof managePool>>, TError, ManagePoolMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof managePool>>, TError, ManagePoolMutationVariables, TContext>;
export type ManagePoolMutationResult = NonNullable<Awaited<ReturnType<typeof managePool>>>;
export type ManagePoolMutationBody = BodyType<PoolManagementInput>;
export type ManagePoolMutationError = ErrorType<void>;
export type ManagePoolMutationVariables = {
    data: BodyType<PoolManagementInput>;
};
export declare const useManagePool: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof managePool>>, TError, ManagePoolMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof managePool>>, TError, ManagePoolMutationVariables, TContext>;
export declare const getGetScoringRulesUrl: () => string;
/**
 * @summary Current pool scoring rules
 */
export declare const getScoringRules: (options?: Parameters<typeof customFetch>[1]) => Promise<ScoringRules>;
export declare const getGetScoringRulesQueryKey: () => readonly ["/api/scoring-rules"];
export declare const getGetScoringRulesQueryOptions: <TData = Awaited<ReturnType<typeof getScoringRules>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getScoringRules>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getScoringRules>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetScoringRulesQueryResult = NonNullable<Awaited<ReturnType<typeof getScoringRules>>>;
export type GetScoringRulesQueryError = ErrorType<unknown>;
/**
 * @summary Current pool scoring rules
 */
export declare function useGetScoringRules<TData = Awaited<ReturnType<typeof getScoringRules>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getScoringRules>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateScoringRulesUrl: () => string;
/**
 * @summary Admin-only scoring-rule update with revision protection
 */
export declare const updateScoringRules: (scoringRulesUpdate: ScoringRulesUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<ScoringRules>;
export declare const getUpdateScoringRulesMutationKey: () => readonly ["updateScoringRules"];
export declare const getUpdateScoringRulesMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateScoringRules>>, TError, UpdateScoringRulesMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateScoringRules>>, TError, UpdateScoringRulesMutationVariables, TContext>;
export type UpdateScoringRulesMutationResult = NonNullable<Awaited<ReturnType<typeof updateScoringRules>>>;
export type UpdateScoringRulesMutationBody = BodyType<ScoringRulesUpdate>;
export type UpdateScoringRulesMutationError = ErrorType<void>;
export type UpdateScoringRulesMutationVariables = {
    data: BodyType<ScoringRulesUpdate>;
};
/**
* @summary Admin-only scoring-rule update with revision protection
*/
export declare const useUpdateScoringRules: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateScoringRules>>, TError, UpdateScoringRulesMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateScoringRules>>, TError, UpdateScoringRulesMutationVariables, TContext>;
export declare const getGetImportReviewUrl: () => string;
/**
 * @summary Opening roster import matches and unresolved selections
 */
export declare const getImportReview: (options?: Parameters<typeof customFetch>[1]) => Promise<ImportSelection[]>;
export declare const getGetImportReviewQueryKey: () => readonly ["/api/import-review"];
export declare const getGetImportReviewQueryOptions: <TData = Awaited<ReturnType<typeof getImportReview>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getImportReview>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getImportReview>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetImportReviewQueryResult = NonNullable<Awaited<ReturnType<typeof getImportReview>>>;
export type GetImportReviewQueryError = ErrorType<void>;
/**
 * @summary Opening roster import matches and unresolved selections
 */
export declare function useGetImportReview<TData = Awaited<ReturnType<typeof getImportReview>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getImportReview>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateImportSelectionUrl: (selectionId: string) => string;
/**
 * @summary Confirm or correct one opening selection
 */
export declare const updateImportSelection: (selectionId: string, importSelectionUpdate: ImportSelectionUpdate, options?: Parameters<typeof customFetch>[1]) => Promise<ImportSelection>;
export declare const getUpdateImportSelectionMutationKey: () => readonly ["updateImportSelection"];
export declare const getUpdateImportSelectionMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateImportSelection>>, TError, UpdateImportSelectionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateImportSelection>>, TError, UpdateImportSelectionMutationVariables, TContext>;
export type UpdateImportSelectionMutationResult = NonNullable<Awaited<ReturnType<typeof updateImportSelection>>>;
export type UpdateImportSelectionMutationBody = BodyType<ImportSelectionUpdate>;
export type UpdateImportSelectionMutationError = ErrorType<void>;
export type UpdateImportSelectionMutationVariables = {
    selectionId: string;
    data: BodyType<ImportSelectionUpdate>;
};
/**
* @summary Confirm or correct one opening selection
*/
export declare const useUpdateImportSelection: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateImportSelection>>, TError, UpdateImportSelectionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateImportSelection>>, TError, UpdateImportSelectionMutationVariables, TContext>;
export declare const getGetDailyReportHealthUrl: () => string;
/**
 * @summary Private administrator morning report health, including database outages
 */
export declare const getDailyReportHealth: (options?: Parameters<typeof customFetch>[1]) => Promise<DailyReportHealth>;
export declare const getGetDailyReportHealthQueryKey: () => readonly ["/api/admin/reports/health"];
export declare const getGetDailyReportHealthQueryOptions: <TData = Awaited<ReturnType<typeof getDailyReportHealth>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDailyReportHealth>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDailyReportHealth>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDailyReportHealthQueryResult = NonNullable<Awaited<ReturnType<typeof getDailyReportHealth>>>;
export type GetDailyReportHealthQueryError = ErrorType<void>;
/**
 * @summary Private administrator morning report health, including database outages
 */
export declare function useGetDailyReportHealth<TData = Awaited<ReturnType<typeof getDailyReportHealth>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDailyReportHealth>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDailyReportHistoryUrl: () => string;
/**
 * @summary Saved published daily reports, newest first
 */
export declare const getDailyReportHistory: (options?: Parameters<typeof customFetch>[1]) => Promise<DailyReportHistoryItem[]>;
export declare const getGetDailyReportHistoryQueryKey: () => readonly ["/api/reports"];
export declare const getGetDailyReportHistoryQueryOptions: <TData = Awaited<ReturnType<typeof getDailyReportHistory>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDailyReportHistory>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDailyReportHistory>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDailyReportHistoryQueryResult = NonNullable<Awaited<ReturnType<typeof getDailyReportHistory>>>;
export type GetDailyReportHistoryQueryError = ErrorType<unknown>;
/**
 * @summary Saved published daily reports, newest first
 */
export declare function useGetDailyReportHistory<TData = Awaited<ReturnType<typeof getDailyReportHistory>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDailyReportHistory>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetPublishedDailyReportUrl: (date: string) => string;
/**
 * @summary Daily report by publication date in Toronto
 */
export declare const getPublishedDailyReport: (date: string, options?: Parameters<typeof customFetch>[1]) => Promise<DailyReportResponse>;
export declare const getGetPublishedDailyReportQueryKey: (date: string) => readonly [`/api/reports/${string}`];
export declare const getGetPublishedDailyReportQueryOptions: <TData = Awaited<ReturnType<typeof getPublishedDailyReport>>, TError = ErrorType<void>>(date: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPublishedDailyReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPublishedDailyReport>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPublishedDailyReportQueryResult = NonNullable<Awaited<ReturnType<typeof getPublishedDailyReport>>>;
export type GetPublishedDailyReportQueryError = ErrorType<void>;
/**
 * @summary Daily report by publication date in Toronto
 */
export declare function useGetPublishedDailyReport<TData = Awaited<ReturnType<typeof getPublishedDailyReport>>, TError = ErrorType<void>>(date: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPublishedDailyReport>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDailyAnalysisUrl: (date: string) => string;
/**
 * @summary Verified daily pool analysis for a Toronto calendar date
 */
export declare const getDailyAnalysis: (date: string, options?: Parameters<typeof customFetch>[1]) => Promise<DailyAnalysis>;
export declare const getGetDailyAnalysisQueryKey: (date: string) => readonly [`/api/analysis/${string}`];
export declare const getGetDailyAnalysisQueryOptions: <TData = Awaited<ReturnType<typeof getDailyAnalysis>>, TError = ErrorType<void>>(date: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDailyAnalysis>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDailyAnalysis>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDailyAnalysisQueryResult = NonNullable<Awaited<ReturnType<typeof getDailyAnalysis>>>;
export type GetDailyAnalysisQueryError = ErrorType<void>;
/**
 * @summary Verified daily pool analysis for a Toronto calendar date
 */
export declare function useGetDailyAnalysis<TData = Awaited<ReturnType<typeof getDailyAnalysis>>, TError = ErrorType<void>>(date: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDailyAnalysis>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDailyScoringUrl: (date: string) => string;
/**
 * @summary Sortable player scoring rows for a Toronto calendar date
 */
export declare const getDailyScoring: (date: string, options?: Parameters<typeof customFetch>[1]) => Promise<DailyScoringRow[]>;
export declare const getGetDailyScoringQueryKey: (date: string) => readonly [`/api/daily-scoring/${string}`];
export declare const getGetDailyScoringQueryOptions: <TData = Awaited<ReturnType<typeof getDailyScoring>>, TError = ErrorType<void>>(date: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDailyScoring>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDailyScoring>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDailyScoringQueryResult = NonNullable<Awaited<ReturnType<typeof getDailyScoring>>>;
export type GetDailyScoringQueryError = ErrorType<void>;
/**
 * @summary Sortable player scoring rows for a Toronto calendar date
 */
export declare function useGetDailyScoring<TData = Awaited<ReturnType<typeof getDailyScoring>>, TError = ErrorType<void>>(date: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDailyScoring>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getCreateShareUrl: () => string;
/**
 * @summary Create a read-only share link for a supported pool view
 */
export declare const createShare: (shareInput: ShareInput, options?: Parameters<typeof customFetch>[1]) => Promise<ShareLink>;
export declare const getCreateShareMutationKey: () => readonly ["createShare"];
export declare const getCreateShareMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createShare>>, TError, CreateShareMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createShare>>, TError, CreateShareMutationVariables, TContext>;
export type CreateShareMutationResult = NonNullable<Awaited<ReturnType<typeof createShare>>>;
export type CreateShareMutationBody = BodyType<ShareInput>;
export type CreateShareMutationError = ErrorType<unknown>;
export type CreateShareMutationVariables = {
    data: BodyType<ShareInput>;
};
/**
* @summary Create a read-only share link for a supported pool view
*/
export declare const useCreateShare: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createShare>>, TError, CreateShareMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createShare>>, TError, CreateShareMutationVariables, TContext>;
export declare const getGetPublicShareUrl: (shareId: string) => string;
/**
 * @summary Public read-only shared pool view
 */
export declare const getPublicShare: (shareId: string, options?: Parameters<typeof customFetch>[1]) => Promise<PublicShare>;
export declare const getGetPublicShareQueryKey: (shareId: string) => readonly [`/api/public/${string}`];
export declare const getGetPublicShareQueryOptions: <TData = Awaited<ReturnType<typeof getPublicShare>>, TError = ErrorType<void>>(shareId: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPublicShare>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPublicShare>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPublicShareQueryResult = NonNullable<Awaited<ReturnType<typeof getPublicShare>>>;
export type GetPublicShareQueryError = ErrorType<void>;
/**
 * @summary Public read-only shared pool view
 */
export declare function useGetPublicShare<TData = Awaited<ReturnType<typeof getPublicShare>>, TError = ErrorType<void>>(shareId: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPublicShare>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetAdminAccessUrl: () => string;
/**
 * @summary Check whether the signed-in account is authorized to administer this pool
 */
export declare const getAdminAccess: (options?: Parameters<typeof customFetch>[1]) => Promise<AdminAccess>;
export declare const getGetAdminAccessQueryKey: () => readonly ["/api/admin/access"];
export declare const getGetAdminAccessQueryOptions: <TData = Awaited<ReturnType<typeof getAdminAccess>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminAccess>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAdminAccess>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAdminAccessQueryResult = NonNullable<Awaited<ReturnType<typeof getAdminAccess>>>;
export type GetAdminAccessQueryError = ErrorType<unknown>;
/**
 * @summary Check whether the signed-in account is authorized to administer this pool
 */
export declare function useGetAdminAccess<TData = Awaited<ReturnType<typeof getAdminAccess>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminAccess>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetAdminParticipantEmailsUrl: () => string;
/**
 * @summary Private participant email directory for the verified pool administrator
 */
export declare const getAdminParticipantEmails: (options?: Parameters<typeof customFetch>[1]) => Promise<AdminParticipantEmail[]>;
export declare const getGetAdminParticipantEmailsQueryKey: () => readonly ["/api/admin/participant-emails"];
export declare const getGetAdminParticipantEmailsQueryOptions: <TData = Awaited<ReturnType<typeof getAdminParticipantEmails>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminParticipantEmails>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAdminParticipantEmails>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAdminParticipantEmailsQueryResult = NonNullable<Awaited<ReturnType<typeof getAdminParticipantEmails>>>;
export type GetAdminParticipantEmailsQueryError = ErrorType<void>;
/**
 * @summary Private participant email directory for the verified pool administrator
 */
export declare function useGetAdminParticipantEmails<TData = Awaited<ReturnType<typeof getAdminParticipantEmails>>, TError = ErrorType<void>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAdminParticipantEmails>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetParticipantAccessUrl: () => string;
/**
 * @summary Check the signed-in account's verified roster link and admin status
 */
export declare const getParticipantAccess: (options?: Parameters<typeof customFetch>[1]) => Promise<ParticipantAccess>;
export declare const getGetParticipantAccessQueryKey: () => readonly ["/api/participant/access"];
export declare const getGetParticipantAccessQueryOptions: <TData = Awaited<ReturnType<typeof getParticipantAccess>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getParticipantAccess>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getParticipantAccess>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetParticipantAccessQueryResult = NonNullable<Awaited<ReturnType<typeof getParticipantAccess>>>;
export type GetParticipantAccessQueryError = ErrorType<unknown>;
/**
 * @summary Check the signed-in account's verified roster link and admin status
 */
export declare function useGetParticipantAccess<TData = Awaited<ReturnType<typeof getParticipantAccess>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getParticipantAccess>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map