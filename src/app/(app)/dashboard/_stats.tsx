"use client";

import { useTranslations } from "next-intl";
import {
  Users,
  LayoutGrid,
  GraduationCap,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

type StatItem = {
  key: string;
  label: string;
  value: number | string;
  icon: LucideIcon;
};

export type DashboardStatsProps = {
  students: number;
  classes: number;
  teachers: number;
  parents: number;
};

export function DashboardStats(props: DashboardStatsProps) {
  const t = useTranslations("dashboard");
  const shouldReduce = useReducedMotion();

  const overview: StatItem[] = [
    { key: "students", label: t("statStudents"), value: props.students, icon: Users },
    { key: "classes",  label: t("statClasses"),  value: props.classes,  icon: LayoutGrid },
    { key: "teachers", label: t("statTeachers"), value: props.teachers, icon: GraduationCap },
    { key: "parents",  label: t("statParents"),  value: props.parents,  icon: UsersRound },
  ];

  return (
    <div className="space-y-8">
      <Section title={t("overviewLabel")}>
        <Grid>
          {overview.map((item, i) => (
            <StatCard key={item.key} item={item} index={i} shouldReduce={!!shouldReduce} />
          ))}
        </Grid>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

function StatCard({
  item,
  index,
  shouldReduce,
}: {
  item: StatItem;
  index: number;
  shouldReduce: boolean;
}) {
  const Icon = item.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        ease: [0.2, 0, 0, 1],
        delay: shouldReduce ? 0 : index * 0.05,
      }}
      whileHover={shouldReduce ? undefined : { y: -2 }}
      className="group relative rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-5 shadow-card transition-shadow duration-200 ease-out hover:border-[color:var(--color-border-strong)] hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-[color:var(--color-foreground-muted)]">
          {item.label}
        </p>
        <span
          className="inline-flex size-8 items-center justify-center rounded-md bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)] transition-colors duration-200 ease-out"
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-[color:var(--color-foreground)]">
        {item.value}
      </p>
    </motion.div>
  );
}
