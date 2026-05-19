"use client";

import { Children, isValidElement } from "react";
import { motion, useReducedMotion } from "motion/react";

export function StaggerGrid({
  children,
  className,
  stagger = 0.05,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  const shouldReduce = useReducedMotion();
  const items = Children.toArray(children).filter(isValidElement);

  return (
    <div className={className}>
      {items.map((child, i) => (
        <motion.div
          key={(child as React.ReactElement<{ key?: React.Key }>).key ?? i}
          initial={{ opacity: 0, y: shouldReduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.2,
            ease: [0.2, 0, 0, 1],
            delay: shouldReduce ? 0 : i * stagger,
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
