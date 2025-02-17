import React, { useState, useEffect } from "react";

interface CountdownProps {
    targetDate: string;
}

interface TimeLeft {
    dagen?: number;
    uren?: number;
    minuten?: number;
    seconden?: number;
}

const Countdown: React.FC<CountdownProps> = ({ targetDate }) => {
    const calculateTimeLeft = (): TimeLeft => {
        const difference = +new Date(targetDate) - +new Date();
        if (difference > 0) {
            return {
                dagen: Math.floor(difference / (1000 * 60 * 60 * 24)),
                uren: Math.floor((difference / (1000 * 60 * 60)) % 24),
                minuten: Math.floor((difference / 1000 / 60) % 60),
                seconden: Math.floor((difference / 1000) % 60),
            };
        }
        return {};
    };

    const [timeLeft, setTimeLeft] = useState<TimeLeft>(calculateTimeLeft());

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        return () => clearInterval(timer);
    }, [targetDate]);

    const timerComponents = Object.keys(timeLeft).map((interval) => (
        <span key={interval}>
            {timeLeft[interval]} {interval}{" "}
        </span>
    ));

    return (
        <div className="countdown">
            {timerComponents.length ? timerComponents : <span>Festival has started!</span>}
        </div>
    );
};

export default Countdown;
