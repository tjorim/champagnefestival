'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getDictionary, Dictionary } from "@/lib/i18n";

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
    const [dictionary, setDictionary] = useState<Dictionary>({} as Dictionary);
    const [timeLeft, setTimeLeft] = useState<TimeLeft>({});
    
    // Convert string date to Date object if needed
    // Wrapped in useMemo to avoid dependency changes on every render
    const targetDateObj = useMemo(() => {
        return typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
    }, [targetDate]);
    
    // Use refs to avoid dependency cycles
    const dictionaryRef = useRef(dictionary);
    const targetDateObjRef = useRef(targetDateObj);
    
    // Update refs when props change
    useEffect(() => {
        targetDateObjRef.current = targetDateObj;
    }, [targetDateObj]);
    
    // Load dictionary on client side
    useEffect(() => {
        const loadDictionary = async () => {
            const dict = await getDictionary(lang);
            setDictionary(dict);
            dictionaryRef.current = dict;
        };
        
        loadDictionary();
    }, [lang]);

    // Set component as mounted after initial render
    useEffect(() => {
        setMounted(true);
    }, []);
    
    // Calculate time left using refs to avoid dependency cycles
    const calculateTimeLeft = useCallback((): TimeLeft => {
        const dict = dictionaryRef.current;
        const targetDate = targetDateObjRef.current;
        
        // Get time difference in milliseconds
        const difference = +targetDate - +new Date();

        if (difference > 0) {
            return {
                [dict.countdown?.days || "days"]: Math.floor(difference / TimeUnits.Day),
                [dict.countdown?.hours || "hours"]: Math.floor((difference / TimeUnits.Hour) % 24),
                [dict.countdown?.minutes || "minutes"]: Math.floor((difference / TimeUnits.Minute) % 60),
                [dict.countdown?.seconds || "seconds"]: Math.floor((difference / TimeUnits.Second) % 60),
            };
        }

        return {};
    }, []);

    // Update countdown every second, but only after component is mounted
    useEffect(() => {
        if (!mounted) return;
        
        // Wait for dictionary to be loaded
        if (Object.keys(dictionaryRef.current).length === 0) return;
        
        // Initial calculation
        setTimeLeft(calculateTimeLeft());

        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        // Clean up interval on unmount
        return () => clearInterval(timer);
    }, [mounted, calculateTimeLeft]);

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