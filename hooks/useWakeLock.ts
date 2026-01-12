import { useEffect, useRef } from 'react';
import { logger } from '../services/logger';

export const useWakeLock = () => {
    const wakeLockRef = useRef<any>(null);

    useEffect(() => {
        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator) {
                    wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                    logger.debug('Wake lock acquired');

                    // Re-request wake lock if user returns to the app
                    document.addEventListener('visibilitychange', async () => {
                        if (document.hidden) {
                            // App went to background, wake lock will be released
                            logger.debug('App went to background');
                        } else {
                            // App came back to foreground, re-request wake lock
                            try {
                                wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
                                logger.debug('Wake lock re-acquired');
                            } catch (err) {
                                logger.warn('Failed to re-acquire wake lock:', err);
                            }
                        }
                    });
                } else {
                    logger.debug('Wake Lock API not supported');
                }
            } catch (err) {
                logger.warn('Failed to acquire wake lock:', err);
            }
        };

        requestWakeLock();

        // Cleanup: release wake lock on unmount
        return () => {
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch((err: any) => {
                    logger.debug('Error releasing wake lock:', err);
                });
                wakeLockRef.current = null;
            }
        };
    }, []);
};
