'use client';

import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

/**
 * Props for the Countdown component
 */
interface CountdownProps {
    targetDate: string | Date;
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
 * Countdown component that displays time remaining until a target date
 * Handles hydration mismatches by only rendering the final countdown on client-side
 */
const Countdown: React.FC<CountdownProps> = ({ targetDate }) => {
    const [mounted, setMounted] = useState(false);
    const { t } = useTranslation();
    
    // Convert string date to Date object if needed
    const targetDateObj = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;

    // Set component as mounted after initial render
    useEffect(() => {
        setMounted(true);
    }, []);

    /**
     * Calculate the time left until the target date
     * @returns {TimeLeft} Object containing time units remaining
     */
    const calculateTimeLeft = useCallback((): TimeLeft => {
        // Get time difference in milliseconds
        const difference = +targetDateObj - +new Date();

        if (difference > 0) {
            return {
                [t("countdown.days", "days")]: Math.floor(difference / TimeUnits.Day),
                [t("countdown.hours", "hours")]: Math.floor((difference / TimeUnits.Hour) % 24),
                [t("countdown.minutes", "minutes")]: Math.floor((difference / TimeUnits.Minute) % 60),
                [t("countdown.seconds", "seconds")]: Math.floor((difference / TimeUnits.Second) % 60),
            };
        }

        return {};
    }, [targetDateObj, t]);

    const [timeLeft, setTimeLeft] = useState<TimeLeft>(calculateTimeLeft());

    // Update countdown every second
    useEffect(() => {
        // Initial calculation
        setTimeLeft(calculateTimeLeft());

        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        // Clean up interval on unmount
        return () => clearInterval(timer);
    }, [targetDateObj, calculateTimeLeft]);

    // Map time units to display components
    const timerComponents = Object.keys(timeLeft).map((interval: string) => (
        <span key={interval} className="countdown-unit">
            <span className="countdown-value">{timeLeft[interval as keyof TimeLeft]}</span>{" "}
            <span className="countdown-label">{interval}</span>{" "}
        </span>
    ));

    return (
        <div
            className="countdown"
            suppressHydrationWarning
            aria-live="polite" // Announce updates to screen readers
        >
            {mounted ? (
                timerComponents.length ? (
                    <div className="countdown-units">{timerComponents}</div>
                ) : (
                    <span className="countdown-complete">{t("countdown.started", "Festival has started!")}</span>
                )
            ) : (
                <span className="countdown-loading">{t("countdown.loading", "Loading countdown...")}</span>
            )}
        </div>
    );
};

export default Countdown;