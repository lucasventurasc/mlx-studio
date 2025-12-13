// SVG Icons component
const { html } = window.preact;

// Icon wrapper with consistent sizing
export const Icon = ({ children, size = 20, className = '' }) => html`
    <svg
        class="${className}"
        width="${size}"
        height="${size}"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        ${children}
    </svg>
`;

// Brain/Model icon
export const BrainIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M12 4.5a2.5 2.5 0 0 0-4.96-.46 2.5 2.5 0 0 0-1.98 3 2.5 2.5 0 0 0 0 4.92 2.5 2.5 0 0 0 1.98 3 2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 4.96.46 2.5 2.5 0 0 0 1.98-3 2.5 2.5 0 0 0 0-4.92 2.5 2.5 0 0 0-1.98-3 2.5 2.5 0 0 0-4.96.46"/>
        <path d="M12 8v8"/>
        <path d="M8 12h8"/>
    <//>
`;

// User icon
export const UserIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <circle cx="12" cy="8" r="4"/>
        <path d="M20 21a8 8 0 1 0-16 0"/>
    <//>
`;

// Bot/Assistant icon
export const BotIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <rect x="3" y="11" width="18" height="10" rx="2"/>
        <circle cx="12" cy="5" r="2"/>
        <path d="M12 7v4"/>
        <path d="M8 16h.01"/>
        <path d="M16 16h.01"/>
    <//>
`;

// System/Info icon
export const InfoIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 16v-4"/>
        <path d="M12 8h.01"/>
    <//>
`;

// Settings/Gear icon
export const SettingsIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
        <circle cx="12" cy="12" r="3"/>
    <//>
`;

// Chat/Message icon
export const ChatIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    <//>
`;

// Download/Package icon
export const PackageIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M16.5 9.4 7.55 4.24"/>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.29 7 12 12 20.71 7"/>
        <line x1="12" x2="12" y1="22" y2="12"/>
    <//>
`;

// Sun icon (light mode)
export const SunIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2"/>
        <path d="M12 20v2"/>
        <path d="m4.93 4.93 1.41 1.41"/>
        <path d="m17.66 17.66 1.41 1.41"/>
        <path d="M2 12h2"/>
        <path d="M20 12h2"/>
        <path d="m6.34 17.66-1.41 1.41"/>
        <path d="m19.07 4.93-1.41 1.41"/>
    <//>
`;

// Moon icon (dark mode)
export const MoonIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    <//>
`;

// Monitor icon (system mode)
export const MonitorIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <rect width="20" height="14" x="2" y="3" rx="2"/>
        <line x1="8" x2="16" y1="21" y2="21"/>
        <line x1="12" x2="12" y1="17" y2="21"/>
    <//>
`;

// Lock icon
export const LockIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    <//>
`;

// Globe icon (network)
export const GlobeIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
        <path d="M2 12h20"/>
    <//>
`;

// Search icon
export const SearchIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.3-4.3"/>
    <//>
`;

// Chevron down icon
export const ChevronDownIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="m6 9 6 6 6-6"/>
    <//>
`;

// Send icon
export const SendIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="m22 2-7 20-4-9-9-4Z"/>
        <path d="M22 2 11 13"/>
    <//>
`;

// Plus icon
export const PlusIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M5 12h14"/>
        <path d="M12 5v14"/>
    <//>
`;

// X/Close icon
export const XIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M18 6 6 18"/>
        <path d="m6 6 12 12"/>
    <//>
`;

// Stop/Square icon (for cancel streaming)
export const StopIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <rect x="6" y="6" width="12" height="12" rx="1"/>
    <//>
`;

// Sparkles icon (for AI)
export const SparklesIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
        <path d="M5 3v4"/>
        <path d="M3 5h4"/>
        <path d="M19 17v4"/>
        <path d="M17 19h4"/>
    <//>
`;

// Download icon
export const DownloadIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" x2="12" y1="15" y2="3"/>
    <//>
`;

// External link icon
export const ExternalLinkIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M15 3h6v6"/>
        <path d="M10 14 21 3"/>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <//>
`;

// Copy icon
export const CopyIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
    <//>
`;

// Check icon
export const CheckIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M20 6 9 17l-5-5"/>
    <//>
`;

export const TagIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/>
        <path d="M7 7h.01"/>
    <//>
`;

// Heart icon
export const HeartIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    <//>
`;

// Arrow up/down icons for navigation
export const ArrowUpIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="m18 15-6-6-6 6"/>
    <//>
`;

export const ArrowDownIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="m6 9 6 6 6-6"/>
    <//>
`;

// Trash icon
export const TrashIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M3 6h18"/>
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
    <//>
`;

// Eject/Unload icon
export const EjectIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="m12 5-8 8h16z"/>
        <rect x="4" y="17" width="16" height="2" rx="1"/>
    <//>
`;

// Refresh icon
export const RefreshIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
        <path d="M16 16h5v5"/>
    <//>
`;

// Columns/Compare icon
export const ColumnsIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
        <line x1="12" x2="12" y1="3" y2="21"/>
    <//>
`;

// Zap/Lightning icon
export const ZapIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    <//>
`;

// Target/Crosshair icon
export const TargetIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="6"/>
        <circle cx="12" cy="12" r="2"/>
    <//>
`;

// Menu/Hamburger icon
export const MenuIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <line x1="4" x2="20" y1="12" y2="12"/>
        <line x1="4" x2="20" y1="6" y2="6"/>
        <line x1="4" x2="20" y1="18" y2="18"/>
    <//>
`;

// Link icon
export const LinkIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    <//>
`;

// Folder icon
export const FolderIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
    <//>
`;

// Microphone icon (for voice mode)
export const MicrophoneIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" x2="12" y1="19" y2="22"/>
    <//>
`;

// Microphone off icon
export const MicrophoneOffIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <line x1="2" x2="22" y1="2" y2="22"/>
        <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
        <path d="M5 10v2a7 7 0 0 0 12 5"/>
        <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
        <line x1="12" x2="12" y1="19" y2="22"/>
    <//>
`;

// Volume/Speaker icon
export const VolumeIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    <//>
`;

// Volume mute icon
export const VolumeMuteIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <line x1="22" x2="16" y1="9" y2="15"/>
        <line x1="16" x2="22" y1="9" y2="15"/>
    <//>
`;

// Waveform/Audio icon
export const WaveformIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"/>
    <//>
`;

// Phone/Call icon (for voice mode toggle)
export const PhoneIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    <//>
`;

// Keyboard icon (for PTT indicator)
export const KeyboardIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <rect width="20" height="16" x="2" y="4" rx="2" ry="2"/>
        <path d="M6 8h.001"/>
        <path d="M10 8h.001"/>
        <path d="M14 8h.001"/>
        <path d="M18 8h.001"/>
        <path d="M8 12h.001"/>
        <path d="M12 12h.001"/>
        <path d="M16 12h.001"/>
        <path d="M7 16h10"/>
    <//>
`;

// RefreshCw icon (circular refresh)
export const RefreshCwIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.86 6.74 2.74L21 8"/>
        <path d="M21 3v5h-5"/>
    <//>
`;

// Clock icon
export const ClockIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
    <//>
`;

// Activity icon (pulse/graph)
export const ActivityIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    <//>
`;

// Database icon
export const DatabaseIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <ellipse cx="12" cy="5" rx="9" ry="3"/>
        <path d="M3 5v14a9 3 0 0 0 18 0V5"/>
        <path d="M3 12a9 3 0 0 0 18 0"/>
    <//>
`;

// BarChart icon
export const BarChartIcon = ({ size, className }) => html`
    <${Icon} size=${size} className=${className}>
        <line x1="12" x2="12" y1="20" y2="10"/>
        <line x1="18" x2="18" y1="20" y2="4"/>
        <line x1="6" x2="6" y1="20" y2="14"/>
    <//>
`;
