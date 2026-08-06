/**
 * icons.jsx — the single place icons are chosen.
 *
 * Icons come from lucide-react (MIT, no attribution required, ships with shadcn/ui).
 * To swap in a licensed set (Noun Project, Flaticon, an in-house set): drop the SVGs in
 * and re-point the export below — every screen follows, because nothing imports
 * lucide-react directly.
 *
 *   export { default as IconRisk } from './svg/risk.svg?react';
 *
 * Note: Noun Project and Flaticon both carry attribution or subscription obligations —
 * check the licence before shipping their assets.
 */
export {
  // navigation & chrome
  LayoutDashboard as IconDashboard,
  FileText as IconDocument,
  Settings as IconSettings,
  LogOut as IconSignOut,
  ExternalLink as IconExternal,
  ArrowLeft as IconBack,
  Search as IconSearch,
  SlidersHorizontal as IconFilter,
  // risk & review
  ShieldAlert as IconRiskHigh,
  ShieldCheck as IconRiskLow,
  Shield as IconRisk,
  Sparkles as IconAi,
  TriangleAlert as IconWarning,
  CircleAlert as IconIssue,
  CircleCheck as IconOk,
  Info as IconInfo,
  Scale as IconLegal,
  // workflow
  UserRound as IconAssignee,
  CalendarDays as IconDeadline,
  Clock as IconClock,
  RefreshCw as IconRefresh,
  Download as IconDownload,
  Upload as IconUpload,
  Send as IconSend,
  PenLine as IconSign,
  Check as IconCheck,
  ChevronRight as IconChevronRight,
  Building2 as IconOrg,
  Users as IconTeam,
  Banknote as IconMoney,
  Database as IconData,
  Plus as IconPlus,
  Trash2 as IconDiscard,
} from 'lucide-react';
