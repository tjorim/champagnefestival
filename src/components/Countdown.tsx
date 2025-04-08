import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { festivalEndDate } from "../config/dates";

/**
 * Props for the Countdown component
 */
interface CountdownProps {
    targetDate: string | Date;
    autoHideAfterDays?: number; // Days after festival end to auto-hide the countdown
}

/**
 * Structure for time remaining until target date
 * All properties are optional since they won't exist after the target date
 */
interface TimeLeft {
    [key: string]: number | undefined;
}

/**
 * Time units in milliseconds for conversion
 */
enum TimeUnits {
    Day = 1000 * 60 * 60 * 24,
    Hour = 1000 * 60 * 60,
    Minute = 1000 * 60,
    Second = 1000
}

/**
 * Status of the festival countdown
 */
enum CountdownStatus {
    UPCOMING = 'upcoming',  // Festival is in the future
    CURRENT = 'current',    // Festival is happening now
    CONCLUDED = 'concluded', // Festival just ended (within grace period)
    HIDDEN = 'hidden'       // Festival ended long ago, don't show anything
}

/**
 * Countdown component that displays time remaining until a target date
 * Features:
 * - Dynamic countdown to festival start date
 * - Different states for upcoming, current, and concluded festival
 * - Auto-hides after a configurable period following the festival
 * - Full accessibility support with ARIA attributes
 * - Client-side only rendering to prevent hydration mismatches
 */
const Countdown: React.FC<CountdownProps> = ({ targetDate, autoHideAfterDays = 30 }) => {
    const { t } = useTranslation();
    const [mounted, setMounted] = useState(false);
    const [timeLeft, setTimeLeft] = useState<TimeLeft>({});
    const [status, setStatus] = useState<CountdownStatus>(CountdownStatus.UPCOMING);
    
    // Convert string date to Date object if needed
    // Wrapped in useMemo to avoid dependency changes on every render
    const targetDateObj = useMemo(() => {
        return typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
    }, [targetDate]);
    
    // Use refs to avoid dependency cycles
    // Define a type for the translations ref
    interface TimeUnitsTranslations {
        days: string;
        hours: string;
        minutes: string;
        seconds: string;
    }
    
    const tRef = useRef<TimeUnitsTranslations | null>(null);
    const targetDateObjRef = useRef(targetDateObj);
    
    // Update refs when values change
    useEffect(() => {
        targetDateObjRef.current = targetDateObj;
    }, [targetDateObj]);
    
    // Update translation ref once when it's available
    useEffect(() => {
        if (!tRef.current) {
            tRef.current = {
                days: t('countdown.days', 'Days'),
                hours: t('countdown.hours', 'Hours'),
                minutes: t('countdown.minutes', 'Minutes'),
                seconds: t('countdown.seconds', 'Seconds')
            };
        }
    }, [t]);
    
    // Determine the current status of the countdown
    const determineCountdownStatus = useCallback(() => {
        const now = new Date();
        const festivalStart = targetDateObjRef.current;
        const festivalEnd = new Date(festivalEndDate);
        
        // Add end of day to festival end date (23:59:59)
        festivalEnd.setHours(23, 59, 59);
        
        // Festival hasn't started yet
        if (now < festivalStart) {
            return CountdownStatus.UPCOMING;
        }
        
        // Festival is currently happening
        if (now >= festivalStart && now <= festivalEnd) {
            return CountdownStatus.CURRENT;
        }
        
        // Festival recently concluded (within autoHideAfterDays)
        const hideDate = new Date(festivalEnd);
        hideDate.setDate(hideDate.getDate() + autoHideAfterDays);
        
        if (now <= hideDate) {
            return CountdownStatus.CONCLUDED;
        }
        
        // Festival ended long ago
        return CountdownStatus.HIDDEN;
    }, [autoHideAfterDays]);

    // Set component as mounted after initial render
    useEffect(() => {
        setMounted(true);
    }, []);
    
    // Calculate time left using refs to avoid dependency cycles
    const calculateTimeLeft = useCallback((): TimeLeft => {
        if (!tRef.current) return {};
        
        const targetDate = targetDateObjRef.current;
        
        // Get time difference in milliseconds
        const difference = +targetDate - +new Date();

        if (difference > 0) {
            return {
                [tRef.current.days]: Math.floor(difference / TimeUnits.Day),
                [tRef.current.hours]: Math.floor((difference / TimeUnits.Hour) % 24),
                [tRef.current.minutes]: Math.floor((difference / TimeUnits.Minute) % 60),
                [tRef.current.seconds]: Math.floor((difference / TimeUnits.Second) % 60),
            };
        }

        return {};
    }, []);

    // Update countdown every second, but only after component is mounted and translations are loaded
    useEffect(() => {
        if (!mounted || !tRef.current) return;
        
        // Initial calculation
        setTimeLeft(calculateTimeLeft());
        
        // Determine initial status
        setStatus(determineCountdownStatus());

        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
            
            // Regularly check status (less frequently than time updates)
            // This ensures status changes when festival starts/ends without requiring a page refresh
            if (Math.random() < 0.1) { // Only check ~10% of the time to reduce calculations
                setStatus(determineCountdownStatus());
            }
        }, 1000);

        // Clean up interval on unmount
        return () => clearInterval(timer);
    }, [mounted, calculateTimeLeft, determineCountdownStatus]);

    // Map time units to display components
    const timerComponents = Object.keys(timeLeft).map((interval: string) => (
        <span key={interval} className="countdown-unit">
            <span className="countdown-value">{timeLeft[interval as keyof TimeLeft]}</span>{" "}
            <span className="countdown-label">{interval}</span>{" "}
        </span>
    ));

    // Don't render anything if the status is HIDDEN
    if (status === CountdownStatus.HIDDEN) {
        return null;
    }
    
    return (
        <div
            className={`countdown countdown-${status.toLowerCase()}`}
            aria-live="polite" // Announce updates to screen readers
        >
            {!mounted ? (
                <span className="countdown-loading">{t('countdown.loading', 'Loading countdown...')}</span>
            ) : status === CountdownStatus.CONCLUDED ? (
                // Festival just concluded
                <span className="countdown-concluded">
                    {t('countdown.concluded', 'Festival has concluded. See you next time!')}
                </span>
            ) : status === CountdownStatus.CURRENT ? (
                // Festival is happening now
                <span className="countdown-current">
                    {t('countdown.happening', 'The festival is happening now!')}
                </span>
            ) : (
                // Upcoming festival with countdown
                timerComponents.length ? (
                    <div className="countdown-units">{timerComponents}</div>
                ) : (
                    <span className="countdown-complete">{t('countdown.started', 'The festival has started!')}</span>
                )
            )}
        </div>
    );
};

export default Countdown;
