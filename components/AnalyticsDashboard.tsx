import React, { useEffect, useState } from 'react';
import { getStats, getEvents } from '../services/analyticsService';
import { UserStats, AnalyticsEvent } from '../types';

export const AnalyticsDashboard: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [stats, setStats] = useState<UserStats>(getStats());
    const [events, setEvents] = useState<AnalyticsEvent[]>(getEvents());

    useEffect(() => {
        const handleUpdate = () => {
            setStats(getStats());
            setEvents(getEvents());
        };

        window.addEventListener('analytics_updated', handleUpdate);
        return () => window.removeEventListener('analytics_updated', handleUpdate);
    }, []);

    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 left-4 p-2 bg-black/40 hover:bg-black/60 text-white/50 hover:text-white rounded-full backdrop-blur-sm transition-all text-xs flex items-center gap-2 border border-white/10 z-50"
                title="Ver Estadísticas de Uso"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Stats
            </button>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsOpen(false)}>
            <div className="bg-[#1e1e1e] border border-white/10 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <h2 className="text-white font-bold flex items-center gap-2">
                        <span className="text-green-400">📊</span> Panel de Análisis de Usuario
                    </h2>
                    <button onClick={() => setIsOpen(false)} className="text-white/50 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                        <p className="text-xs text-white/50 uppercase">Sesiones</p>
                        <p className="text-2xl font-mono text-blue-400">{stats.totalSessions}</p>
                    </div>
                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                        <p className="text-xs text-white/50 uppercase">Mensajes</p>
                        <p className="text-2xl font-mono text-purple-400">{stats.totalMessagesSent}</p>
                    </div>
                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                        <p className="text-xs text-white/50 uppercase">Estado PWA</p>
                        <p className={`text-lg font-bold ${stats.isInstalled ? 'text-green-400' : 'text-yellow-400'}`}>
                            {stats.isInstalled ? 'INSTALADA' : 'NAVEGADOR'}
                        </p>
                    </div>
                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                        <p className="text-xs text-white/50 uppercase">Última Visita</p>
                        <p className="text-xs text-white/80 mt-2">
                            {new Date(stats.lastVisit).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-white/50">
                            {new Date(stats.lastVisit).toLocaleTimeString()}
                        </p>
                    </div>
                </div>

                {/* Event Log */}
                <div className="flex-1 overflow-y-auto p-4 border-t border-white/10">
                    <h3 className="text-xs font-bold text-white/40 mb-3 uppercase tracking-wider">Historial de Eventos (Últimos 50)</h3>
                    <div className="space-y-2">
                        {events.map((event, idx) => (
                            <div key={idx} className="flex gap-3 text-sm font-mono p-2 hover:bg-white/5 rounded transition-colors border-l-2 border-transparent hover:border-white/20">
                                <span className="text-white/30 whitespace-nowrap">
                                    {new Date(event.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                                </span>
                                <div className="flex-1">
                                    <span className="text-[#ffcc00] mr-2">{event.eventName}</span>
                                    {event.properties && (
                                        <span className="text-white/40 text-xs">
                                            {JSON.stringify(event.properties)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                        {events.length === 0 && (
                            <p className="text-white/20 text-center py-8 italic">No hay eventos registrados aún.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
