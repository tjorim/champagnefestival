import React, { useEffect, useState } from "react";
import Bubble from "./Bubble";

const BubbleBackground: React.FC = () => {
    const [bubbleCount, setBubbleCount] = useState(50);
    const [mounted, setMounted] = useState(false);
    const [bubbles, setBubbles] = useState<JSX.Element[]>([]);

    useEffect(() => {
        setMounted(true);
        const handleResize = () => {
            // Fewer bubbles on small screens (e.g., mobile width less than 768px)
            if (window.innerWidth < 768) {
                setBubbleCount(20);
            } else {
                setBubbleCount(50);
            }
        };

        handleResize(); // set initial count
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // Generate bubbles only after mounting so that random values aren't generated on the server.
    useEffect(() => {
        if (mounted) {
            const generatedBubbles = Array.from({ length: bubbleCount }, (_, i) => (
                <Bubble
                    key={i}
                    size={Math.random() * 20 + 5} // between 5px and 25px
                    duration={Math.random() * 10 + 5} // between 5s and 15s
                    delay={Math.random() * 5} // delay up to 5s
                    left={Math.random() * 100} // random horizontal position
                />
            ));
            setBubbles(generatedBubbles);
        }
    }, [bubbleCount, mounted]);

    if (!mounted) {
        // Return an empty container with suppressHydrationWarning on the server.
        return <div className="bubble-container" suppressHydrationWarning />;
    }

    return <div className="bubble-container">{bubbles}</div>;
};

export default BubbleBackground;
