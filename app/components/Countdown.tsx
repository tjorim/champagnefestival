'use client';

import React, { useState, useEffect, useCallback } from "react";
import { getDictionary } from "@/get-dictionary";

/**
 * Props for the Countdown component
 */
interface CountdownProps {
    targetDate: string | Date;
    lang: string;
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
const Countdown: React.FC<CountdownProps> = ({ targetDate, lang }) => {
    const [mounted, setMounted] = useState(false);
    const [dictionary, setDictionary] = useState<any>({});
    
    // Convert string date to Date object if needed
    const targetDateObj = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;

    // Load dictionary on client side
    useEffect(() => {
        const loadDictionary = async () => {
            const dict = await getDictionary(lang);
            setDictionary(dict);
        };
        
        loadDictionary();
    }, [lang]);

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
                [dictionary.countdown?.days || "days"]: Math.floor(difference / TimeUnits.Day),
                [dictionary.countdown?.hours || "hours"]: Math.floor((difference / TimeUnits.Hour) % 24),
                [dictionary.countdown?.minutes || "minutes"]: Math.floor((difference / TimeUnits.Minute) % 60),
                [dictionary.countdown?.seconds || "seconds"]: Math.floor((difference / TimeUnits.Second) % 60),
            };
        }

        return {};
    }, [targetDateObj, dictionary]);

    const [timeLeft, setTimeLeft] = useState<TimeLeft>({});

    // Update countdown every second
    useEffect(() => {
        if (Object.keys(dictionary).length > 0) {
            // Initial calculation
            setTimeLeft(calculateTimeLeft());

            const timer = setInterval(() => {
                setTimeLeft(calculateTimeLeft());
            }, 1000);

            // Clean up interval on unmount
            return () => clearInterval(timer);
        }
    }, [targetDateObj, calculateTimeLeft, dictionary]);

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
                    <span className="countdown-complete">{dictionary.countdown?.started || "Festival has started!"}</span>
                )
            ) : (
                <span className="countdown-loading">{dictionary.countdown?.loading || "Loading countdown..."}</span>
            )}
        </div>
    );
};

export default Countdown;