import React, { useState, useEffect } from "react";

const Countdown = ({ targetDate }) => {
    const calculateTimeLeft = () => {
        const difference = +new Date(targetDate) - +new Date();
        let timeLeft = {};
        if (difference > 0) {
            timeLeft = {
                dagen: Math.floor(difference / (1000 * 60 * 60 * 24)),
                uren: Math.floor((difference / (1000 * 60 * 60)) % 24),
                minuten: Math.floor((difference / 1000 / 60) % 60),
                seconden: Math.floor((difference / 1000) % 60),
            };
        }
        return timeLeft;
    };

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

    useEffect(() => {
        const timer = setTimeout(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        return () => clearTimeout(timer);
    });

    const timerComponents = [];

    Object.keys(timeLeft).forEach((interval) => {
        timerComponents.push(
            <span key={interval}>
                {timeLeft[interval]} {interval}{" "}
            </span>
        );
    });

    return (
        <div className="countdown">
            {timerComponents.length ? (
                timerComponents
            ) : (
                <span>Festival has started!</span>
            )}
        </div>
    );
};

export default Countdown;
