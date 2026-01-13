import React, { useState, useEffect, useMemo, useRef } from 'react';
import { InstallManager } from './components/InstallManager';
import { WeighingForm } from './components/WeighingForm';
import { getRecords, deleteRecord, clearAllRecords, getUserProfile, saveUserProfile, getTheme, saveTheme } from './services/storageService';
import { WeighingRecord, Language, UserProfile } from './types';
import { LanguageProvider, useTranslation } from './services/i18n';
import { ToastProvider, useToast } from './components/Toast';
import { InstallPrompt } from './components/InstallPrompt';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { initAnalytics, trackEvent } from './services/analyticsService';

// Tolerance limit 200g
const TOLERANCE_KG = 0.2;

// --- HELPER: Expiration Logic ---
const checkExpirationRisk = (dateStr?: string): string | null => {
    if (!dateStr) return null;
    const cleanDate = dateStr.replace(/[\.-]/g, '/').trim();
    const parts = cleanDate.split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000; 
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    const expDate = new Date(year, month, day);
    const today = new Date();
    today.setHours(0,0,0,0);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `VENCIDO (${Math.abs(diffDays)}d)`;
    if (diffDays === 0) return 'VENCE HOY';
    if (diffDays <= 3) return `⚠️ (${diffDays}d)`;
    if (diffDays <= 7) return `CRÍTICO (${diffDays}d)`;
    return null;
};

// --- COMPONENT: Full Screen Image Modal ---
const FullScreenImageModal: React.FC<{ src: string; onClose: () => void }> = ({ src, onClose }) => {
    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center animate-fade-in p-4" onClick={onClose}>
            <button onClick={onClose} className="absolute top-6 right-6 p-4 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all z-50 backdrop-blur-md">
                <span className="material-icons-round text-3xl">close</span>
            </button>
            <img src={src} alt="Evidence Full Screen" className="max-w-full max-h-[90vh] object-contain rounded-[2rem] shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
    );
};

// --- COMPONENT: Refined History Item ---
const HistoryItem: React.FC<{ 
    record: WeighingRecord; 
    onDelete: (id: string) => void;
    onShare: (record: WeighingRecord) => void;
    onViewImage: (src: string) => void;
}> = ({ record, onDelete, onShare, onViewImage }) => {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);

    const netWeight = typeof record.netWeight === 'number' ? record.netWeight : 0;
    const noteWeight = typeof record.noteWeight === 'number' ? record.noteWeight : 0;
    const taraTotal = typeof record.taraTotal === 'number' ? record.taraTotal : 0;
    const diff = netWeight - noteWeight;
    const isWeightError = Math.abs(diff) > TOLERANCE_KG;
    const riskMsg = checkExpirationRisk(record.expirationDate);

    // Dynamic Border Color
    const statusBorder = riskMsg ? 'border-red-500' : isWeightError ? 'border-orange-500' : 'border-emerald-500';

    return (
        <div className={`group bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 shadow-card hover:shadow-lg transition-all duration-300 mb-3 overflow-hidden relative`}>
            {/* Status Indicator Line (Left) */}
            <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${statusBorder.replace('border', 'bg')}`}></div>

            <div className="p-6 pl-7 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex justify-between items-start">
                    <div className="flex-1 pr-4">
                        <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-base leading-snug">{record.supplier}</h3>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 font-medium">{record.product}</p>
                    </div>
                    <div className="text-right">
                         <div className={`font-mono font-bold text-xl tracking-tight ${isWeightError ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-700 dark:text-zinc-200'}`}>
                            {netWeight.toFixed(2)}<span className="text-xs ml-0.5 font-sans opacity-60 text-zinc-400">kg</span>
                        </div>
                    </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2 mt-3 items-center">
                    {record.productionDate && (
                         <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                             <span className="material-icons-round text-[10px] text-zinc-400">factory</span>
                             <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300">{record.productionDate}</span>
                         </div>
                    )}
                    {record.expirationDate && (
                         <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                             <span className="material-icons-round text-[10px] text-zinc-400">event_busy</span>
                             <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300">{record.expirationDate}</span>
                         </div>
                    )}
                    {record.boxes && record.boxes.qty > 0 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
                            <span className="material-icons-round text-[10px] text-blue-400">layers</span>
                            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-300">cx {record.boxes.qty}x{(record.boxes.unitTara * 1000).toFixed(0)}g</span>
                        </div>
                    )}
                    {riskMsg && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 animate-pulse">
                            <span className="material-icons-round text-[10px] text-red-500">warning</span>
                            <span className="text-[10px] font-bold text-red-600 dark:text-red-300">{riskMsg}</span>
                        </div>
                    )}
                     {record.aiAnalysis && (
                         <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800/30">
                            <span className="material-icons-round text-[10px] text-purple-400">smart_toy</span>
                            <span className="text-[10px] font-bold text-purple-600 dark:text-purple-300">IA</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="bg-zinc-50/80 dark:bg-zinc-950/50 px-7 pb-7 pt-2 border-t border-zinc-100 dark:border-zinc-800/50 animate-slide-down">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 mt-4 text-xs">
                        <div className="flex justify-between items-center py-2 border-b border-zinc-200 dark:border-zinc-800 border-dashed">
                            <span className="text-zinc-500 dark:text-zinc-400 font-medium">Peso Nota</span>
                            <span className="font-mono font-bold text-zinc-800 dark:text-white text-sm">{noteWeight}</span>
                        </div>
                         <div className="flex justify-between items-center py-2 border-b border-zinc-200 dark:border-zinc-800 border-dashed">
                            <span className="text-zinc-500 dark:text-zinc-400 font-medium">Diferencia</span>
                            <span className={`font-mono font-bold text-sm ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-zinc-500'}`}>
                                {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-zinc-200 dark:border-zinc-800 border-dashed">
                            <span className="text-zinc-500 dark:text-zinc-400 font-medium">Tara Total</span>
                            <span className="font-mono font-bold text-zinc-800 dark:text-white text-sm">{taraTotal.toFixed(2)}</span>
                        </div>
                         {record.batch && (
                            <div className="flex justify-between items-center col-span-2 py-2 border-b border-zinc-200 dark:border-zinc-800 border-dashed">
                                <span className="text-zinc-500 dark:text-zinc-400 font-medium">Lote</span>
                                <span className="font-mono font-bold text-zinc-800 dark:text-white text-sm">{record.batch}</span>
                            </div>
                        )}
                        {record.aiAnalysis && (
                            <div className="col-span-2 mt-4 bg-white dark:bg-zinc-800 p-4 rounded-2xl border border-purple-100 dark:border-purple-900/30 shadow-sm">
                                <p className="font-black text-purple-600 dark:text-purple-300 text-[10px] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <span className="material-icons-round text-xs">smart_toy</span> Análisis IA
                                </p>
                                <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed font-medium">{record.aiAnalysis}</p>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 justify-end mt-6">
                        {record.evidence && (
                            <button onClick={(e) => { e.stopPropagation(); onViewImage(record.evidence!); }} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-primary-600 hover:border-primary-200 transition-colors shadow-sm">
                                <span className="material-icons-round text-xl">image</span>
                            </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); onShare(record); }} className="flex-1 py-3 px-5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors border border-emerald-100 dark:border-emerald-800/30">
                            <span className="material-icons-round text-sm">share</span> WhatsApp
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(record.id); }} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 border border-red-100 dark:border-red-900/30 transition-colors">
                            <span className="material-icons-round text-xl">delete</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- MAIN APP COMPONENT ---
const App: React.FC = () => {
    const { t, language, setLanguage } = useTranslation();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'weigh' | 'history'>('weigh');
    const [records, setRecords] = useState<WeighingRecord[]>([]);
    const [userProfile, setUserProfile] = useState<UserProfile>(getUserProfile());
    const [theme, setThemeState] = useState<'light' | 'dark'>(getTheme());
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [viewImage, setViewImage] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterPeriod, setFilterPeriod] = useState<'all' | 'today' | 'week'>('all');

    useEffect(() => {
        initAnalytics();
        setRecords(getRecords());
    }, []);

    useEffect(() => {
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }, [theme]);

    useEffect(() => { if (activeTab === 'history') setRecords(getRecords()); }, [activeTab]);

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setThemeState(newTheme);
        saveTheme(newTheme);
    };

    const handleDeleteRecord = (id: string) => {
        if (confirm(t('msg_confirm_delete'))) {
            deleteRecord(id);
            setRecords(getRecords());
            showToast(t('msg_history_cleared'), 'success');
        }
    };

    const handleShare = (record: WeighingRecord) => {
        const diff = (record.netWeight || 0) - (record.noteWeight || 0);
        const icon = Math.abs(diff) <= TOLERANCE_KG ? '✅' : '⚠️';
        const msg = `${t('rpt_title')}\n${t('rpt_supplier')} ${record.supplier}\n${t('rpt_product')} ${record.product}\n${record.batch ? `${t('rpt_batch')} ${record.batch}\n` : ''}${record.expirationDate ? `${t('rpt_expiration')} ${record.expirationDate}\n` : ''}\n${t('rpt_note')} ${record.noteWeight}kg\n${t('rpt_gross')} ${record.grossWeight}kg\n${t('rpt_tara')} ${record.taraTotal ? record.taraTotal.toFixed(2) : '0.00'}kg\n${t('rpt_net')} ${(record.netWeight || 0).toFixed(2)}kg\n\n${t('rpt_diff')} ${diff > 0 ? '+' : ''}${diff.toFixed(2)}kg ${icon}${record.aiAnalysis ? `\n${t('rpt_ai_obs')} ${record.aiAnalysis}` : ''}`;
        const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
        trackEvent('share_whatsapp', { recordId: record.id });
    };

    const handleProfileSave = (e: React.FormEvent) => {
        e.preventDefault();
        saveUserProfile(userProfile);
        showToast(t('msg_profile_saved'), 'success');
        setIsMenuOpen(false);
    };

    const filteredRecords = records.filter(r => {
        const matchesSearch = r.supplier.toLowerCase().includes(searchTerm.toLowerCase()) || r.product.toLowerCase().includes(searchTerm.toLowerCase());
        const recordDate = new Date(r.timestamp);
        const today = new Date();
        let matchesPeriod = true;
        if (filterPeriod === 'today') matchesPeriod = recordDate.toDateString() === today.toDateString();
        else if (filterPeriod === 'week') { const weekAgo = new Date(); weekAgo.setDate(today.getDate() - 7); matchesPeriod = recordDate >= weekAgo; }
        return matchesSearch && matchesPeriod;
    });

    const exportCSV = () => {
        const headers = ["Data", "Fornecedor", "Produto", "Lote", "Validade", "Peso Nota", "Peso Bruto", "Tara", "Liquido", "Diferenca", "Status"];
        const rows = filteredRecords.map(r => [new Date(r.timestamp).toLocaleDateString(), r.supplier, r.product, r.batch || '', r.expirationDate || '', r.noteWeight, r.grossWeight, r.taraTotal || 0, r.netWeight, (r.netWeight - r.noteWeight).toFixed(2), r.status]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `conferente_data_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        trackEvent('export_csv', { count: filteredRecords.length });
    };

    return (
        <div className="min-h-screen font-sans relative overflow-x-hidden selection:bg-primary-500/30 selection:text-primary-900">
            <InstallManager />
            <AnalyticsDashboard />
            {viewImage && <FullScreenImageModal src={viewImage} onClose={() => setViewImage(null)} />}

            {/* HEADER */}
            <header className="fixed top-0 w-full z-40 glass transition-all duration-300">
                <div className="max-w-7xl mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-primary-500/30">C</div>
                         <div className="hidden sm:block">
                             <h1 className="font-bold text-zinc-900 dark:text-white leading-none tracking-tight text-lg">Conferente</h1>
                             <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Pro Assistant</p>
                         </div>
                    </div>
                    <div className="hidden md:flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800/50 p-1.5 rounded-full border border-zinc-200 dark:border-zinc-700/50">
                        <button onClick={() => setActiveTab('weigh')} className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${activeTab === 'weigh' ? 'bg-white dark:bg-zinc-700 text-primary-600 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'}`}>Conferencia</button>
                        <button onClick={() => setActiveTab('history')} className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${activeTab === 'history' ? 'bg-white dark:bg-zinc-700 text-primary-600 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'}`}>Histórico</button>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={toggleTheme} className="w-10 h-10 rounded-full bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors border border-zinc-200 dark:border-zinc-700">
                            <span className="material-icons-round text-lg">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
                        </button>
                        <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-700 mx-1"></div>
                        <button onClick={() => setIsMenuOpen(true)} className="flex items-center gap-3 group">
                            <div className="text-right hidden md:block">
                                <p className="text-xs font-bold text-zinc-800 dark:text-white group-hover:text-primary-600 transition-colors">{userProfile.name}</p>
                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{userProfile.role}</p>
                            </div>
                            <div className="relative">
                                <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden ring-2 ring-white dark:ring-zinc-700 shadow-md transition-transform group-hover:scale-105">
                                    {userProfile.photo ? <img src={userProfile.photo} alt="Profile" className="w-full h-full object-cover" /> : <span className="material-icons-round text-zinc-400 w-full h-full flex items-center justify-center text-lg">person</span>}
                                </div>
                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-zinc-900 rounded-full"></div>
                            </div>
                        </button>
                    </div>
                </div>
            </header>

            {/* SIDE MENU */}
            {isMenuOpen && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsMenuOpen(false)}></div>
                    <div className="relative w-80 bg-white dark:bg-zinc-900 h-full shadow-2xl p-8 overflow-y-auto animate-slide-left border-l border-zinc-100 dark:border-zinc-800 flex flex-col">
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-lg font-bold dark:text-white">{t('lbl_profile')}</h2>
                            <button onClick={() => setIsMenuOpen(false)} className="w-9 h-9 flex items-center justify-center bg-zinc-50 dark:bg-zinc-800 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors">
                                <span className="material-icons-round dark:text-white text-sm">close</span>
                            </button>
                        </div>
                        <div className="flex flex-col items-center gap-4 mb-8">
                            <div className="w-28 h-28 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden relative group border-4 border-white dark:border-zinc-800 shadow-xl">
                                {userProfile.photo ? <img src={userProfile.photo} alt="User" className="w-full h-full object-cover" /> : <span className="material-icons-round text-4xl text-zinc-300 w-full h-full flex items-center justify-center">person</span>}
                                <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                    <span className="material-icons-round text-white">edit</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = ev => setUserProfile(p => ({ ...p, photo: ev.target?.result as string })); reader.readAsDataURL(file); } }} />
                                </label>
                            </div>
                            <p className="text-sm text-primary-600 dark:text-primary-400 font-bold cursor-pointer hover:underline">{t('btn_change_photo')}</p>
                        </div>
                        <form onSubmit={handleProfileSave} className="space-y-6 flex-1">
                            <div>
                                <label className="text-xs font-black text-zinc-400 uppercase mb-2.5 block tracking-widest">{t('lbl_name')}</label>
                                <input type="text" value={userProfile.name} onChange={e => setUserProfile(p => ({...p, name: e.target.value}))} className="w-full bg-zinc-50 dark:bg-zinc-800 border-0 rounded-2xl px-5 py-4 dark:text-white text-sm font-bold transition-all outline-none focus:ring-2 focus:ring-primary-500/50" placeholder={t('ph_name')} />
                            </div>
                            <div>
                                <label className="text-xs font-black text-zinc-400 uppercase mb-2.5 block tracking-widest">{t('lbl_role')}</label>
                                <input type="text" value={userProfile.role} onChange={e => setUserProfile(p => ({...p, role: e.target.value}))} className="w-full bg-zinc-50 dark:bg-zinc-800 border-0 rounded-2xl px-5 py-4 dark:text-white text-sm font-bold transition-all outline-none focus:ring-2 focus:ring-primary-500/50" placeholder={t('ph_role')} />
                            </div>
                            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                <label className="text-xs font-black text-zinc-400 uppercase mb-3 block tracking-widest">Idioma</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['pt', 'es', 'en'] as const).map(lang => (
                                        <button key={lang} type="button" onClick={() => setLanguage(lang)} className={`py-2.5 rounded-xl text-xs font-bold uppercase transition-all border ${language === lang ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent shadow-md' : 'bg-transparent text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'}`}>{lang}</button>
                                    ))}
                                </div>
                            </div>
                        </form>
                        <div className="mt-auto pt-6">
                            <button onClick={handleProfileSave} className="w-full bg-primary-600 hover:bg-primary-700 text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary-500/30 transition-all active:scale-[0.98]">{t('btn_save')}</button>
                        </div>
                    </div>
                </div>
            )}

            <main className="pt-24 pb-32 px-4 w-full">
                <div className="max-w-xl mx-auto">
                    {activeTab === 'weigh' && <div className="animate-fade-in"><WeighingForm /></div>}
                    {activeTab === 'history' && (
                        <div className="animate-fade-in">
                            <div className="sticky top-20 z-30 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md rounded-[1.5rem] border border-white/20 dark:border-white/5 shadow-subtle p-4 mb-6 space-y-3">
                                 <div className="relative group">
                                    <span className="material-icons-round absolute left-4 top-3 text-zinc-400 text-xl group-focus-within:text-primary-500 transition-colors">search</span>
                                    <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={t('ph_search')} className="w-full pl-12 pr-4 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-2xl outline-none dark:text-white font-medium text-sm focus:bg-white dark:focus:bg-zinc-700 border-0 focus:ring-2 focus:ring-primary-500/50 transition-all placeholder:text-zinc-400" />
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar items-center">
                                    {[
                                        { id: 'all', label: t('filter_all') },
                                        { id: 'today', label: t('filter_today') },
                                        { id: 'week', label: t('filter_week') }
                                    ].map(f => (
                                        <button key={f.id} onClick={() => setFilterPeriod(f.id as any)} className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap transition-all border ${filterPeriod === f.id ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent shadow-md' : 'bg-transparent text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'}`}>{f.label}</button>
                                    ))}
                                    <div className="flex-1"></div>
                                    <button onClick={exportCSV} className="w-9 h-9 flex items-center justify-center bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500 hover:text-emerald-500 transition-colors shadow-sm"><span className="material-icons-round text-sm">download</span></button>
                                </div>
                            </div>
                            {filteredRecords.length === 0 ? (
                                <div className="text-center py-20 opacity-50 flex flex-col items-center">
                                    <div className="w-24 h-24 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-5"><span className="material-icons-round text-5xl text-zinc-300 dark:text-zinc-600">history</span></div>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">{t('hist_empty')}</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredRecords.map(record => <HistoryItem key={record.id} record={record} onDelete={handleDeleteRecord} onShare={handleShare} onViewImage={setViewImage} />)}
                                </div>
                            )}
                             {records.length > 0 && (
                                <div className="mt-10 text-center">
                                    <button onClick={() => { if(confirm(t('msg_confirm_delete_all'))) { clearAllRecords(); setRecords([]); } }} className="text-red-400 hover:text-red-600 text-xs font-bold opacity-70 hover:opacity-100 transition-opacity uppercase tracking-widest px-6 py-3 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl">{t('btn_delete_all_history')}</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* DYNAMIC NAVIGATION ISLAND */}
            <nav className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-full shadow-glow p-2 flex items-center gap-2 z-50 max-w-[95%] overflow-hidden transition-all duration-300 ring-1 ring-black/5">
                <button onClick={() => { setActiveTab('weigh'); trackEvent('nav_click', { tab: 'weigh' }); }} className={`h-14 px-8 rounded-full flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'weigh' ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg font-bold' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                    <span className="material-icons-round text-2xl">scale</span>
                    {activeTab === 'weigh' && <span className="text-sm animate-fade-in whitespace-nowrap">{t('tab_weigh')}</span>}
                </button>
                <button onClick={() => { setActiveTab('history'); trackEvent('nav_click', { tab: 'history' }); }} className={`h-14 px-8 rounded-full flex items-center justify-center gap-2 transition-all duration-300 ${activeTab === 'history' ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg font-bold' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                    <span className="material-icons-round text-2xl">history</span>
                     {activeTab === 'history' && <span className="text-sm animate-fade-in whitespace-nowrap">{t('tab_history')}</span>}
                </button>
                {activeTab === 'weigh' && (
                    <>
                        <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-700 mx-1.5"></div>
                    </>
                )}
            </nav>
            <InstallPrompt className="fixed bottom-24 left-4 right-4 z-40 md:left-auto md:right-4 md:w-80 md:bottom-4" />
        </div>
    );
};

export default () => (
    <LanguageProvider>
        <ToastProvider>
            <App />
        </ToastProvider>
    </LanguageProvider>
);
