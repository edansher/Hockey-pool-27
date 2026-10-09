import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Route, Switch, Link, useLocation, useParams, Router as WouterRouter } from 'wouter';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, CircleHelp, ClipboardList, Clock3, ExternalLink, FileCheck2, Filter,
  Home, Menu, Search, ShieldCheck, Snowflake, Trophy, X,
} from 'lucide-react';
import {
    useGetAdminAccess, getGetAdminAccessQueryKey,
  useGetOwner, useHealthCheck, useGetParticipantAccess, getGetParticipantAccessQueryKey,
  useGetPublicShare,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { DraftImportSummary, DraftOwners, DraftRosterView } from '@/components/draft-rosters';
import { PoolRulebook } from '@/components/pool-rulebook';
import { NhlSourcePanel } from '@/components/nhl-source-panel';
import { TransactionsView, TransactionsEntry } from '@/components/transactions';
import { AuthTokenBridge } from '@/components/auth-token-bridge';
import { SessionGate, RememberMe, clearSessionMarkers } from '@/components/session-preference';
import { SeasonRef, useSeasonRefs } from '@/components/season-reference';
import { AdminManagement } from '@/components/admin-management';
import { AdminParticipantEmails } from '@/components/admin-participant-emails';
import { AdminScoringRules } from '@/components/admin-scoring-rules';
import { AdminTransactionPayments } from '@/components/admin-transaction-payments';
import { MobilePoolHome } from '@/components/mobile-pool-home';
import { DailyReportSection } from '@/components/daily-report';
import { DailyPoolAnalysis } from '@/components/daily-pool-analysis';
import { PlayersLeaderboard, PlayerLeaderDetail, TopPlayerLeaders } from '@/components/pool-leaders';
import { NhlLinesDirectory } from '@/components/nhl-lines-directory';
import { AvailablePlayers } from '@/components/available-players';
import { PoolStandings } from '@/components/pool-standings';
import { PoolLiveRefresh } from '@/components/pool-live-refresh';
import { PlayerOwnerLookup } from '@/components/player-owner-lookup';
import { PoolLogo } from '@/components/pool-logo';
import { PoolPollPopup } from '@/components/pool-poll-popup';
import { PollsPage } from '@/components/polls-page';
import { AdminPoolPolls } from '@/components/admin-pool-polls';
import { useIsMobile } from '@/hooks/use-mobile';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL || (import.meta.env.PROD ? `${window.location.origin}${basePath}/api/__clerk` : undefined);
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
const clerkAppearance = {
  theme: shadcn, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#14546a', colorForeground: '#203443', colorMutedForeground: '#6d7a82',
    colorDanger: '#b74836', colorBackground: '#fbf8ef', colorInput: '#f5f1e7',
    colorInputForeground: '#203443', colorNeutral: '#d9d2c4', fontFamily: 'DM Sans, sans-serif', borderRadius: '12px',
  },
  elements: {
    rootBox: 'w-full flex justify-center', cardBox: 'bg-[#fbf8ef] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#203443] font-bold', headerSubtitle: 'text-[#65747e]',
    socialButtonsBlockButtonText: 'text-[#203443]', formFieldLabel: 'text-[#203443] font-semibold',
    footerActionLink: 'text-[#14546a] font-semibold', footerActionText: 'text-[#6d7a82]',
    dividerText: 'text-[#6d7a82]', identityPreviewEditButton: 'text-[#14546a]',
    formFieldSuccessText: 'text-[#2b7154]', alertText: 'text-[#203443]', logoBox: 'mb-2',
    logoImage: 'max-h-10', socialButtonsBlockButton: 'border-[#d9d2c4] bg-[#f7f3e9]',
    formButtonPrimary: 'bg-[#14546a] hover:bg-[#0d4255]', formFieldInput: 'bg-[#f5f1e7] border-[#d9d2c4] text-[#203443]',
    footerAction: 'text-[#6d7a82]', dividerLine: 'bg-[#d9d2c4]', alert: 'bg-[#f5eee5]',
    otpCodeFieldInput: 'bg-[#f5f1e7] border-[#d9d2c4]', formFieldRow: 'mb-4', main: 'gap-5',
  },
};

type Standing = { id:string; name:string; rank:number|null; previousRank:number|null; rankMovement:number; seasonPoints:number; yesterdayPoints:number; livePoints:number; gamesPlayed:number; pointsPerGame:number; transactionsUsed:number; rosterComplete:boolean };
function SnapRow({p}:{p:{id:string;name:string;team:string|null;poolPoints:number|null;nhlPlayerId?:string|null;ownerId?:string|null}}){const refs=useSeasonRefs();return <div className="flex justify-between border-b border-[#ebe6db] py-3 text-sm"><span>{p.name} · {p.team||'Team unavailable'}</span><span className="mono text-right">{number(p.poolPoints)} credits<SeasonRef className="block" value={refs.byPlayer(p.ownerId??'',p.nhlPlayerId??null)}/></span></div>}
type Player = { id:string; nhlPlayerId:string|null; name:string; position:string; team:string|null; injuryStatus:string|null; ownerId:string|null; ownerName:string|null; active:boolean; lastGameDate:string|null; gamesPlayed:number; goals:number; assists:number; powerPlayGoals:number; shortHandedGoals:number; overtimeGoals:number; hatTricks:number; poolPoints:number; lastGamePoints:number };
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString() : '—';
const dateLabel = (v?: string|null) => v ? new Date(v).toLocaleDateString('en-CA', { year:'numeric', month:'short', day:'numeric' }) : 'Date unavailable';
const initials = (name?:string) => (name || 'HP').split(/\s+/).map(x => x[0]).join('').slice(0,2).toUpperCase();
function Header({compact=false}:{compact?:boolean}) {
  const [open,setOpen] = useState(false);
  const health=useHealthCheck();
  const {userId,isLoaded}=useAuth();
  const acc=useGetParticipantAccess({query:{queryKey:[...getGetParticipantAccessQueryKey(),userId],enabled:isLoaded&&!!userId,staleTime:30000}});
  const isAdmin=!!userId&&acc.data?.authorized===true&&acc.data?.isAdmin===true;
  const allLinks = [['Overview','/'],['Standings','/standings'],['Teams','/rosters'],['Players','/players'],['Lines','/lines'],['Available','/available'],['Analysis','/daily-analysis'],['Transactions','/transactions'],['Points system','/rules'],['Admin','/admin']];
  const links = allLinks.filter(([l])=>l!=='Admin'||isAdmin);
  return <header className="sticky top-0 z-40 border-b border-[#d9d2c4] bg-[#f8f5ec]/95 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
    <div className="relative mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 md:px-8">
      <Link href="/" className="group flex items-center gap-3" data-testid="link-brand">
        <PoolLogo/>
        <span className="leading-none"><span className="display block text-[22px] font-bold uppercase tracking-tight">Hockey Pool</span><span className="mono text-[9px] uppercase tracking-[.19em] text-[#7f8786]">2026—27 · nine owners</span></span>
      </Link>
      <span className="pointer-events-none absolute left-[54%] top-2 mono text-[9px] text-[#63727a] lg:hidden" data-testid="mobile-header-monthly-price">$29.99 P/M</span>
      {!compact && <nav className="hidden items-center gap-1 lg:flex">{links.map(([label,to])=><Link key={label} href={to} className={`rounded-lg px-3 py-2 text-[12px] font-semibold text-[#63727a] transition hover:bg-[#eae6da] hover:text-[#173a4c] ${to === window.location.pathname ? 'bg-[#e9e4d6] text-[#173a4c]' : ''}`} data-testid={`link-nav-${label.toLowerCase()}`}>{label}</Link>)}</nav>}
      <div className="flex items-center gap-2"><span className="hidden items-center gap-1.5 rounded-full bg-[#e8eee6] px-2.5 py-1.5 text-[9px] font-semibold text-[#52735f] md:inline-flex" data-testid="status-service">{health.data?.status?'Service reachable':'Status unreported'}<span className={`h-1.5 w-1.5 rounded-full ${health.data?.status?'bg-[#568365]':'bg-[#b0a58c]'}`}/></span>{isLoaded&&!userId&&<span className="hidden items-center rounded-full bg-[#efe7d3] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#7a6a3a] sm:inline-flex" data-testid="badge-guest">Guest · Watch only</span>}{userId ? <SessionSignOut compact/> : <Link href="/sign-in" className="inline-flex min-h-11 items-center rounded-lg border border-[#d9d2c4] px-3 py-2 text-xs font-semibold text-[#173a4c] transition hover:bg-[#eee9dc]" data-testid="link-sign-in">Sign in</Link>}<button className="min-h-11 min-w-11 rounded-lg p-2 text-[#173a4c] lg:hidden" onClick={()=>setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open} data-testid="button-menu">{open?<X size={20}/>:<Menu size={20}/>}</button></div>
    </div>
    {open && <nav className="grid grid-cols-2 gap-1 border-t border-[#d9d2c4] px-4 py-3 lg:hidden">{links.map(([label,to])=><Link key={label} href={to} onClick={()=>setOpen(false)} className="rounded-md px-3 py-2 text-sm font-semibold text-[#173a4c] hover:bg-[#eae6da]" data-testid={`mobile-nav-${label.toLowerCase()}`}>{label}</Link>)}</nav>}
  </header>;
}
function MobilePoolNavigation() {
  const [location] = useLocation();
  const tabs = [
    { label: 'Home', to: '/', icon: Home, id: 'home' },
    { label: 'Standings', to: '/standings', icon: Trophy, id: 'standings' },
    { label: 'Teams', to: '/rosters', icon: ClipboardList, id: 'participants' },
    { label: 'Analysis', to: '/daily-analysis', icon: BarChart3, id: 'analysis' },
    { label: 'Points', to: '/rules', icon: FileCheck2, id: 'points-system' },
  ];
  return <nav aria-label="Mobile pool navigation" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-[#d9d2c4] bg-[#faf8f1]/95 px-2 pt-2 backdrop-blur-md lg:hidden" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))', paddingLeft: 'max(8px, env(safe-area-inset-left, 0px))', paddingRight: 'max(8px, env(safe-area-inset-right, 0px))' }}>
    {tabs.map(({ label, to, icon: Icon, id }) => {
      const active = to === '/' ? location === '/' : location === to || location.startsWith(`${to}/`);
      return <Link key={id} href={to} aria-current={active ? 'page' : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#173a4c] ${active ? 'bg-[#ece7d9] text-[#14546a]' : 'text-[#67767c] hover:bg-[#f0ece1]'}`} data-testid={`mobile-tab-${id}`}><Icon size={20} aria-hidden="true"/><span>{label}</span></Link>;
    })}
  </nav>;
}
function Shell({children,publicView=false}:{children:ReactNode;publicView?:boolean}) {
  const mobile = useIsMobile(1024) && !publicView;
  return <div className="grain min-h-[100dvh] bg-[#f3f0e7] text-[#203443]" style={mobile ? { paddingBottom: 'calc(88px + env(safe-area-inset-bottom, 0px))', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' } : undefined}>
    <Header compact={publicView}/>
    {children}
    <footer className="mx-auto mt-16 flex max-w-[1440px] flex-col gap-2 border-t border-[#d9d2c4] px-5 py-6 text-[11px] text-[#77827f] md:flex-row md:items-center md:justify-between md:px-8"><span>Hockey Pool 2026–27 <span className="px-1">/</span> Private owners’ ledger</span><span className="flex items-center gap-2"><ShieldCheck size={13}/>Pool points are based on verified official regular-season data.</span></footer>
    {mobile && <MobilePoolNavigation/>}
  </div>;
}
function Page({eyebrow,title,subtitle,children,action}:{eyebrow:string;title:string;subtitle?:string;children:ReactNode;action?:ReactNode}) {
 return <main className="page-in mx-auto min-h-[72vh] max-w-[1440px] px-4 pb-8 pt-8 md:px-8 md:pt-12"><div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><div className="mono mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-[#c65c3e]">{eyebrow}</div><h1 className="display text-5xl font-bold leading-[.95] tracking-tight text-[#173a4c] md:text-6xl">{title}</h1>{subtitle&&<p className="mt-3 max-w-2xl text-sm leading-6 text-[#67767c]">{subtitle}</p>}</div>{action}</div>{children}</main>;
}
function Panel({children,className=''}:{children:ReactNode;className?:string}) { return <section className={`rounded-2xl border border-[#ded8ca] bg-[#faf8f1] shadow-[0_3px_16px_rgba(46,52,49,.035)] ${className}`}>{children}</section>; }
function Label({children}:{children:ReactNode}) { return <div className="mono text-[10px] font-semibold uppercase tracking-[.16em] text-[#82908c]">{children}</div>; }
function ErrorBox({error,retry}:{error:unknown;retry?:()=>void}) { const msg=error instanceof Error?error.message:'The service could not complete this request.'; return <div className="rounded-xl border border-[#e3b8aa] bg-[#fbede7] p-4 text-sm text-[#874838]" role="alert" data-testid="status-api-error"><b>Data unavailable.</b> {msg}{retry&&<button onClick={retry} className="ml-3 underline underline-offset-2" data-testid="button-retry">Retry</button>}</div>; }
function Loading({rows=4}:{rows?:number}) { return <div className="space-y-3" aria-label="Loading"><div className="h-12 animate-pulse rounded-xl bg-[#e7e2d6]"/>{Array.from({length:rows},(_,i)=><div key={i} className="h-14 animate-pulse rounded-xl bg-[#ebe6db]"/>)}</div>; }
function Empty({title='Nothing to show yet',detail='Verified pool data will appear here once it is available.'}:{title?:string;detail?:string}) { return <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-[#cfc8b9] bg-[#f6f3ea] px-5 text-center"><CircleHelp size={22} className="mb-3 text-[#a1a59c]"/><div className="font-semibold text-[#294253]">{title}</div><p className="mt-1 max-w-md text-sm text-[#7a8582]">{detail}</p></div>; }
function State({isLoading,error,refetch,empty,data,children}:{isLoading:boolean;error:unknown;refetch:()=>void;empty:boolean;data:unknown;children:ReactNode}) { if(isLoading)return <Loading/>; if(error)return <ErrorBox error={error} retry={refetch}/>; if(empty||!data)return <Empty/>; return <>{children}</>; }
function Rank({n}:{n:number|null}) { return <span className="display text-2xl font-bold text-[#82908c]">{n?String(n).padStart(2,'0'):'—'}</span>; }
function Movement({value}:{value:number}) { return value>0?<span className="inline-flex items-center gap-1 text-xs font-semibold text-[#2e7858]"><ArrowUpRight size={14}/>{value}</span>:value<0?<span className="inline-flex items-center gap-1 text-xs font-semibold text-[#b54f39]"><ArrowDownRight size={14}/>{Math.abs(value)}</span>:<span className="text-xs text-[#9aa19a]">—</span>; }
function StandingsTable({rows,compact=false}:{rows?:Standing[];compact?:boolean}) {
 if(!rows?.length)return <Empty title="Standings have not posted" detail="Standings appear when verified regular-season scoring is available."/>;
 return <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left"><thead><tr className="border-b border-[#e1dccf] text-[10px] uppercase tracking-[.12em] text-[#87918e]"><th className="px-4 py-3 font-semibold">Pos</th><th className="px-3 py-3 font-semibold">Owner</th><th className="px-3 py-3 text-right font-semibold">Pool points</th>{!compact&&<><th className="px-3 py-3 text-right font-semibold">Yesterday</th><th className="px-3 py-3 text-right font-semibold">Games</th><th className="px-3 py-3 text-right font-semibold">Pts / game</th></>}<th className="px-4 py-3 text-right font-semibold">Move</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.id} className={`border-b border-[#ebe6db] last:border-0 transition-colors hover:bg-[#f4f0e6] ${i===0?'bg-[#f1eee3]':''}`} data-testid={`row-standing-${r.id}`}><td className="px-4 py-3"><Rank n={r.rank}/></td><td className="px-3 py-3"><Link href={`/rosters/${r.id}`} className="font-semibold text-[#254456] hover:text-[#c65c3e]" data-testid={`link-owner-${r.id}`}>{r.name}</Link>{r.rosterComplete===false&&<span className="ml-2 rounded-full bg-[#f7e5dc] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-[#aa563d]">Roster pending</span>}</td><td className="mono px-3 py-3 text-right font-semibold tabular-nums">{number(r.seasonPoints)}</td>{!compact&&<><td className="mono px-3 py-3 text-right tabular-nums text-[#73817f]">{number(r.yesterdayPoints)}</td><td className="mono px-3 py-3 text-right tabular-nums text-[#73817f]">{number(r.gamesPlayed)}</td><td className="mono px-3 py-3 text-right tabular-nums text-[#73817f]">{r.pointsPerGame.toFixed(2)}</td></>}<td className="px-4 py-3 text-right"><Movement value={r.rankMovement}/></td></tr>)}</tbody></table></div>;
}
function PointsSystemButton() {
 return <Link href="/rules" className="inline-flex items-center gap-2 rounded-lg border border-[#d1b9a5] bg-[#e57955] px-4 py-2.5 text-sm font-bold text-[#182f3a] transition hover:bg-[#f18b68] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173a4c]" data-testid="button-points-system"><FileCheck2 size={16} aria-hidden="true"/>Points system</Link>;
}
function HomePage() {
 const mobile = useIsMobile(1024);
 return mobile ? <Shell><MobilePoolHome/></Shell> : <DashboardPage/>;
}
function DashboardPage() {
 return <Shell><main className="page-in mx-auto max-w-[1440px] px-4 pb-10 pt-6 md:px-8 md:pt-9">
   <div className="mb-5 flex items-start justify-between gap-5" data-testid="desktop-home-actions">
     <aside className="max-w-[210px] shrink-0" aria-label="Monthly subscription offer" data-testid="subscription-offer">
       <div className="mono text-[10px] font-bold uppercase tracking-[.15em] text-[#bf583d]">ONLY</div>
       <p className="flex items-baseline gap-1.5 text-[#173a4c]"><span className="display text-4xl font-bold">$29.99</span><span className="text-xs font-semibold">per month</span></p>
       <p className="mt-1 text-xs leading-5 text-[#67767c]">* Two weeks free trial for pool members only!</p>
     </aside>
     <div className="flex flex-wrap items-start justify-end gap-3">
       <TransactionsEntry className="w-56 shrink-0" tickerBelow/>
        <Link href="/polls" data-testid="button-view-todays-poll" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#166534] bg-[#15803d] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#166534]">Poolside Poll <ArrowRight size={16}/></Link>
       <Link href="/rosters" data-testid="button-desktop-teams" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#173a4c] px-4 py-3 text-sm font-bold text-[#f5f0e5]"><ClipboardList size={18}/>Teams / Drafted players <ArrowRight size={16}/></Link>
       <Link href="/who-has-him" data-testid="button-who-has-him-desktop" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#c7addf] bg-[#e9ddf5] px-4 py-3 text-sm font-bold text-[#4f3569]"><Search size={17}/>Who has him?</Link>
       <PointsSystemButton/>
     </div>
   </div>
  <div className="mb-4"><div className="mono text-[10px] font-semibold uppercase tracking-[.17em] text-[#bf583d]">The pool table · 2026–27</div><h1 className="display mt-1 text-4xl font-bold tracking-tight text-[#173a4c] md:text-5xl">Current standings</h1></div>
  <Panel className="overflow-hidden" data-testid="desktop-live-standings"><div className="flex items-center justify-between px-5 pb-4 pt-5 md:px-6"><div><Label>Live pool standings</Label><h2 className="display mt-1 text-3xl font-bold text-[#173a4c]">Current table</h2></div><Link href="/standings" className="inline-flex items-center gap-1 text-xs font-semibold text-[#15566d]" data-testid="link-all-standings">Full table <ArrowRight size={14}/></Link></div><div className="px-5 pb-5 md:px-6"><PoolStandings showSource={false}/></div></Panel>
  <div className="mt-6 grid gap-5 lg:grid-cols-[1.45fr_.8fr]">
   <div className="relative overflow-hidden rounded-[26px] bg-[#173a4c] px-6 py-8 text-[#f5f0e5] md:px-10 md:py-11"><div className="pointer-events-none absolute -right-6 -top-14 h-72 w-72 rounded-full border border-white/10"/><div className="pointer-events-none absolute -right-1 top-0 h-52 w-52 rounded-full border border-white/10"/><div className="relative z-10 max-w-2xl"><div className="mono text-[10px] uppercase tracking-[.2em] text-[#df9879]">2026–27 season</div><h2 className="display mt-2 text-6xl font-bold uppercase leading-[.86] tracking-tight md:text-8xl">Every point.<br/><span className="text-[#e48a67]">Accounted for.</span></h2><p className="mt-5 max-w-lg text-sm leading-6 text-[#d3d8d3]">Nine owners. One official record. Pool scoring follows verified NHL regular-season data and the rules we agreed to.</p><div className="mt-7 flex flex-wrap gap-3"><Link href="/daily-analysis" className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-4 py-3 text-sm font-semibold text-[#f3eee2] transition hover:bg-white/10" data-testid="link-daily-analysis">Daily analysis</Link></div></div><div className="absolute bottom-5 right-6 hidden items-center gap-3 opacity-50 md:flex"><div className="h-px w-24 bg-[#d4dacf]"/><span className="mono text-[9px] uppercase tracking-[.16em]">Official stats only</span></div></div>
   <DraftImportSummary/>
  </div>
   <div className="mt-4"><NhlSourcePanel/></div>
  <div className="mt-5 grid gap-5 md:grid-cols-2"><Panel className="p-5"><div className="flex items-center gap-2"><ShieldCheck size={16} className="text-[#2f745e]"/><Label>Data standard</Label></div><p className="mt-3 text-sm leading-6 text-[#67767c]">No projections, estimated injuries, or unofficial stats. A point enters the pool only after its official regular-season source is available.</p></Panel><Panel className="p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><ClipboardList size={16} className="text-[#c65c3e]"/><Label>Recent ledger</Label></div><Link href="/transactions" className="text-xs font-semibold text-[#15566d]" data-testid="link-transactions">Open ledger <ArrowRight size={14} className="inline"/></Link></div><p className="mt-3 text-sm text-[#7c8783]">See completed drops and pickups, participant counters, and the actual recorded Toronto date and time in Transactions.</p></Panel></div>
 </main></Shell>;
}
function StandingsPage() {
 const [date,setDate]=useState('');
 return <Shell><Page eyebrow="The pool table" title={date?'Historical standings':'Current standings'} subtitle="Pool points use official regular-season scoring. Unknown totals remain pending—not estimated." action={<label className="flex min-h-12 items-center gap-2 rounded-xl border border-[#d8d1c3] bg-[#faf8f1] px-3 py-2 text-xs font-semibold text-[#53666e]">As of <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="bg-transparent text-sm text-[#203443] outline-none" data-testid="input-standings-date"/></label>}>
 <PoolStandings date={date||undefined}/>
 <div className="mt-4"><TopPlayerLeaders/></div></Page></Shell>;
}
function OwnersPage() {
 return <Shell><Page eyebrow="Your uploaded draft lists" title="Participants’ teams" subtitle="Tap a participant to see all 20 drafted selections, including goalie slots with NHL-verified names, saved from the boards you provided." action={<PointsSystemButton/>}><DraftOwners/></Page></Shell>;
}
function RosterPage() {
 const {ownerId=''}=useParams();
 return <Shell><Page eyebrow="Original draft roster" title="Draft picks" subtitle="Saved directly from the boards you provided." action={<div className="flex flex-wrap items-center gap-4"><Link href="/rosters" className="text-sm font-semibold text-[#15566d]">← All participants</Link><PointsSystemButton/></div>}><DraftRosterView ownerId={ownerId}/></Page></Shell>;
}
function PlayersPage() {
  return <Shell><Page eyebrow="Drafted players" title="Players" subtitle="Confirmed skaters and NHL-verified goalies ranked by pool points; pending goalie-name slots are listed unscored. Pool points are not NHL points or game scores." action={<div className="flex flex-wrap items-center gap-4"><Link href="/lines" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#15566d]" data-testid="link-players-lines">NHL lines <ArrowRight size={14}/></Link><Link href="/rosters" className="text-sm font-semibold text-[#15566d]">Owners' teams</Link></div>}><PlayersLeaderboard/></Page></Shell>;
}
function AvailablePage() {
  return <Shell><Page eyebrow="The wire" title="Available players" subtitle="Current 2026-27 season NHL players not owned by any participant, ranked by our pool points."><AvailablePlayers/></Page></Shell>;
}
function PlayerProfilePage() {
  const {playerId=''}=useParams();
  return <Shell><Page eyebrow="Drafted asset" title="Pool scoring detail" action={<Link href="/players" className="inline-flex items-center gap-2 text-sm font-semibold text-[#15566d]" data-testid="link-back-players"><ArrowLeft size={15}/> Players</Link>}><PlayerLeaderDetail id={playerId}/></Page></Shell>;
}
function AnalysisPage() {
  const {date}=useParams();
  return <Shell><Page eyebrow="Daily pool analysis" title={date?'Daily analysis':"Previous pool day's analysis"} subtitle="The previous pool day, owner by owner, with current standings one tap away."><DailyReportSection/><DailyPoolAnalysis date={date}/></Page></Shell>;
}
function TransactionsPage() {
  return <Shell><Page eyebrow="Permanent record" title="Transactions" subtitle="Completed drops and pickups, with who made them and when the server recorded them (Toronto time)."><TransactionsView/></Page></Shell>;
}
function AdminPage() {
 const {userId,isLoaded}=useAuth();
 const access=useGetAdminAccess({query:{queryKey:[...getGetAdminAccessQueryKey(),userId],enabled:isLoaded,staleTime:0}});
 const signedIn=Boolean(userId)&&access.data?.authenticated===true; const isAdmin=signedIn&&!access.isError&&access.data?.authorized===true;
 return <Shell><Page eyebrow="Pool administrator" title="Admin" subtitle="Your role in this private pool, as verified by the server. Signing in alone does not grant administrator access.">
 <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
  <Panel className="p-6" data-testid="panel-admin-status"><Label>Role status</Label>
   <div className="mt-4" aria-live="polite" aria-busy={access.isLoading}>
   {access.isLoading?<Loading rows={2}/>:access.isError?<ErrorBox error={access.error} retry={()=>access.refetch()}/>:!signedIn?<div className="flex items-start gap-3"><ShieldCheck className="mt-1 shrink-0 text-[#bf5a3e]" aria-hidden="true"/><div><h2 className="display text-3xl font-bold text-[#173a4c]">Sign in required</h2><p className="mt-2 text-sm leading-6 text-[#67767c]">Sign in to check whether your account has pool administrator access.</p><Link href="/sign-in" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#173a4c] px-4 py-2.5 text-sm font-bold text-[#f5f0e5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173a4c]" data-testid="link-admin-sign-in">Sign in <ArrowRight size={16} aria-hidden="true"/></Link></div></div>:!isAdmin?<div className="flex items-start gap-3" role="alert"><ShieldCheck className="mt-1 shrink-0 text-[#bf5a3e]" aria-hidden="true"/><div><h2 className="display text-3xl font-bold text-[#173a4c]">Access denied</h2><p className="mt-2 text-sm leading-6 text-[#67767c]">You are signed in{access.data?.email?<> as <b className="break-all">{access.data.email}</b></>:null}, but this account is not the pool administrator.</p></div></div>:<div className="flex items-start gap-3"><ShieldCheck className="mt-1 shrink-0 text-[#2f745e]" aria-hidden="true"/><div><h2 className="display text-3xl font-bold text-[#173a4c]">Admin access confirmed</h2><p className="mt-2 text-sm leading-6 text-[#67767c]">Signed in as <b className="break-all text-[#203443]" data-testid="text-admin-email">{access.data?.email||'your account'}</b>. As pool administrator, you can manage transaction payments and edit scoring rules below.</p><p className="mt-3 rounded-lg bg-[#f1ede3] p-3 text-sm font-semibold text-[#53666e]">Admin tools: accounts, allowances, roster corrections, eligibility exceptions, reversals, transaction payments, scoring rules and the audit log.</p></div></div>}
   </div>
  </Panel>
  <AdminScoringRules key={`scoring-${userId??'anon'}-${isAdmin}`} isAdmin={isAdmin}/>
 </div>
 {isAdmin&&<AdminTransactionPayments key={`payments-${userId}`}/>}
 {isAdmin&&<AdminParticipantEmails key={userId}/>}
 {isAdmin&&<AdminManagement key={`mgmt-${userId}`}/>}
  {isAdmin&&<AdminPoolPolls key={`polls-${userId}`}/>}
 </Page></Shell>;
}
function PollsRoute() { return <Shell><Page eyebrow="Pool room · daily read" title="You Make the Call" subtitle="Today’s question. Your vote. Have your say."><PollsPage/></Page></Shell>; }
function PublicSharePage() {
 const {shareId=''}=useParams(); const q=useGetPublicShare(shareId);
 return <Shell publicView><Page eyebrow="Public · read only" title={q.data?.title||'Shared pool view'} subtitle={q.data?.date?`Snapshot · ${dateLabel(q.data.date)}`:'A private pool snapshot, shared for viewing only.'}>
 {q.isLoading?<Loading/>:q.isError?<ErrorBox error={q.error} retry={()=>q.refetch()}/>:!q.data?<Empty title="This share is unavailable" detail="The link may have expired or the requested view is not available."/>:<>
 {q.data.view==='standings'&&<Panel className="overflow-hidden"><div className="p-5"><Label>Read-only standings</Label></div><StandingsTable rows={q.data.standings}/></Panel>}
 {(q.data.view==='analysis'||q.data.view==='previousDay')&&<><Panel className="mb-5 p-5"><Label>{q.data.analysis.status} · {dateLabel(q.data.analysis.date)}</Label><p className="mt-2 text-sm leading-6 text-[#627177]">{q.data.analysis.summary||'No analysis summary was returned.'}</p></Panel><Panel className="overflow-hidden"><div className="p-5"><Label>Verified daily scoring</Label></div>{q.data.analysis.scoring?.length?q.data.analysis.scoring.map((r,i)=><div key={`${r.playerId}-${i}`} className="flex justify-between border-t border-[#ebe6db] px-5 py-3 text-sm"><span>{r.ownerName} · {r.playerName}</span><span className="mono font-semibold">{number(r.poolPoints)} pts</span></div>):<div className="p-5"><Empty title="No verified scoring rows"/></div>}</Panel></>}
 {q.data.view==='roster'&&<><Panel className="mb-4 p-5"><Label>{q.data.roster.owner.name} · roster snapshot</Label><div className="display mt-2 text-4xl font-bold">{number(q.data.roster.owner.seasonPoints)} <span className="text-sm">ownership credits</span></div></Panel><Panel className="p-5"><Label>Skaters · read only</Label>{q.data.roster.skaters?.map(p=><SnapRow key={p.id} p={p}/>)}<div className="mt-5"><Label>Goalie teams</Label>{q.data.roster.goalieTeams?.length?q.data.roster.goalieTeams.map(p=><SnapRow key={p.id} p={p}/>):<p className="mt-2 text-sm text-[#7c8783]">No confirmed goalie teams in this snapshot.</p>}</div></Panel></>}</>}
 </Page></Shell>;
}
function SessionSignOut({compact=false}:{compact?:boolean}) { const {signOut}=useClerk(); const {userId}=useAuth(); if(!userId)return null; return <button type="button" onClick={()=>{clearSessionMarkers();void signOut({redirectUrl:`${basePath}/`});}} className="min-h-11 text-xs font-semibold text-[#9b4330] underline" data-testid="button-sign-out-device">{compact ? 'Sign out' : 'Sign out of this device'}</button>; }
 function AuthPage({kind}:{kind:'in'|'up'}) { return <div className="grain flex min-h-[100dvh] flex-col bg-[#f3f0e7]"><Header compact/><div className="flex flex-1 flex-col items-center justify-center px-4 py-10"><div className="mb-5 max-w-[430px] text-center"><div className="mono text-[10px] uppercase tracking-[.2em] text-[#c65c3e]">Hockey Pool 2026–27</div><h1 className="display mt-2 text-4xl font-bold text-[#173a4c]">{kind==='in'?'Back in the room.':'Join the pool.'}</h1><p className="mt-2 text-sm text-[#69777b]">Owner access for the private nine-seat pool.</p><div className="mt-4 rounded-xl border border-[#d8d1c3] bg-[#f0ece1] p-3 text-left text-xs leading-5 text-[#53666e]" data-testid="text-session-guidance"><b className="text-[#254456]">Your own device only.</b> Use the checkbox below to choose whether this browser stays signed in. Do not stay signed in on shared or public devices.<div className="mt-2 flex flex-wrap gap-3"><SessionSignOut/><Link href="/" className="font-semibold text-[#14546a] underline" data-testid="link-guest">Continue as Guest · Watch only</Link></div><p className="mt-1">Guests can view all public pool pages but cannot make or manage transactions.</p></div></div><RememberMe/>{kind==='in'?<SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/`}/>:<SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/`}/>}</div></div>; }
function CacheInvalidator() { const {addListener}=useClerk(); const qc=useQueryClient(); const [loc]=useLocation(); const [seen,setSeen]=useState<string|null|undefined>(undefined); useEffect(()=>addListener(({user})=>{const next=user?.id??null;if(seen!==undefined&&seen!==next)qc.clear();setSeen(next);}),[addListener,qc,seen,loc]); return null; }
function Router() {
 return <><Switch>
  <Route path="/" component={HomePage}/>
  <Route path="/standings" component={StandingsPage}/>
  <Route path="/rosters" component={OwnersPage}/>
  <Route path="/rosters/:ownerId" component={RosterPage}/>
  <Route path="/players" component={PlayersPage}/>
  <Route path="/who-has-him"><Shell><Page eyebrow="The roster index" title="Who has him?" subtitle="Search the nine participants’ saved draft rosters. Matches reflect current roster evidence, not player availability."><PlayerOwnerLookup/></Page></Shell></Route>
  <Route path="/players/:playerId" component={PlayerProfilePage}/>
  <Route path="/lines"><Shell><Page eyebrow="Daily Faceoff" title="NHL lines" subtitle="Choose a club to open its current line combinations on Daily Faceoff."><NhlLinesDirectory/></Page></Shell></Route>
  <Route path="/available"><AvailablePage/></Route>
  <Route path="/daily-analysis" component={AnalysisPage}/>
  <Route path="/daily-analysis/:date" component={AnalysisPage}/>
  <Route path="/transactions" component={TransactionsPage}/>
   <Route path="/polls" component={PollsRoute}/>
  <Route path="/admin" component={AdminPage}/>
  <Route path="/rules"><Shell><Page eyebrow="Hockey Pool 2026–27" title="Points system" subtitle="Your scoring values, confirmed power-play bonuses, and player-change policies."><PoolRulebook/></Page></Shell></Route>
  <Route path="/public/:shareId" component={PublicSharePage}/>
  <Route path="/sign-in/*?"><AuthPage kind="in"/></Route>
  <Route path="/sign-up/*?"><AuthPage kind="up"/></Route>
  <Route component={NotFound}/>
 </Switch><PoolPollPopup/></>;
}
function RoutedErrorBoundary({children}:{children:ReactNode}) { const [location]=useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }
function ClerkRoutes() {
 const [,setLocation]=useLocation();
 return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{signIn:{start:{title:'Welcome back',subtitle:'Sign in to access your owner account'}},signUp:{start:{title:'Join the pool',subtitle:'Create your Hockey Pool owner account'}}}} routerPush={to=>setLocation(stripBase(to))} routerReplace={to=>setLocation(stripBase(to),{replace:true})}>
  <SessionGate><AuthTokenBridge><CacheInvalidator/><RoutedErrorBoundary><Router/></RoutedErrorBoundary></AuthTokenBridge></SessionGate>
 </ClerkProvider>;
}
function App() {
 if(!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
 return <QueryClientProvider client={queryClient}><PoolLiveRefresh/><WouterRouter base={basePath}><ClerkRoutes/></WouterRouter></QueryClientProvider>;
}
export default App;