"use client";

import * as React from "react";
import { Check, Sparkles, X } from "lucide-react";
import type { LessonDraft } from "@/lib/ai/draft-schema";
import { applyLessonDraft, discardLessonDraft } from "@/lib/actions/lessons";
import { Badge, correctionCategoryLabel, insightTypeLabel } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/page-header";

type Keyed<T> = T & { _key: number; _included: boolean };

function keyed<T>(items: T[]): Keyed<T>[] {
  return items.map((item, i) => ({ ...item, _key: i, _included: true }));
}

function stripKeys<T>(items: Keyed<T>[]): T[] {
  return items
    .filter((i) => i._included)
    .map(({ _key, _included, ...rest }) => rest as unknown as T);
}

function IncludeToggle({
  included,
  onToggle,
}: {
  included: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={included ? "Included — click to exclude" : "Excluded — click to include"}
      className={`mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
        included
          ? "border-accent bg-accent text-white"
          : "border-border-strong bg-surface text-transparent hover:border-accent"
      }`}
    >
      <Check className="size-3" />
    </button>
  );
}

function SectionTitle({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <p className="mb-2 mt-4 text-[0.8125rem] font-semibold text-fg-secondary first:mt-0">
      {children}
      <span className="ml-1.5 text-fg-tertiary">{count}</span>
    </p>
  );
}

/**
 * Review UI for a pending AI draft: every extracted item is editable and
 * can be excluded before anything touches the permanent student record.
 */
export function DraftReview({
  lessonId,
  draft,
}: {
  lessonId: string;
  draft: LessonDraft;
}) {
  const [summary, setSummary] = React.useState(draft.summary);
  const [nextFocus, setNextFocus] = React.useState(draft.nextLessonSuggestion);
  const [recapDraft] = React.useState(draft.studentRecapDraft);
  const [topics, setTopics] = React.useState(() => keyed(draft.topics));
  const [corrections, setCorrections] = React.useState(() => keyed(draft.corrections));
  const [vocabulary, setVocabulary] = React.useState(() => keyed(draft.vocabulary));
  const [homework, setHomework] = React.useState(() => keyed(draft.homework));
  const [insights, setInsights] = React.useState(() => keyed(draft.insights));
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function toggle<T>(
    setter: React.Dispatch<React.SetStateAction<Keyed<T>[]>>,
    key: number,
  ) {
    setter((items) =>
      items.map((i) => (i._key === key ? { ...i, _included: !i._included } : i)),
    );
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const payload: LessonDraft = {
          summary,
          nextLessonSuggestion: nextFocus,
          studentRecapDraft: recapDraft,
          topics: stripKeys(topics),
          corrections: stripKeys(corrections),
          vocabulary: stripKeys(vocabulary),
          homework: stripKeys(homework),
          insights: stripKeys(insights),
        };
        await applyLessonDraft(lessonId, JSON.stringify(payload));
      } catch (err) {
        console.error("[draft-review] apply failed:", err);
        setError("Saving the draft failed. Please try again.");
      }
    });
  }

  const includedCount =
    [topics, corrections, vocabulary, homework, insights]
      .flat()
      .filter((i) => i._included).length;

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
          <Sparkles className="size-4 text-accent" />
          AI draft — review before saving
        </h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void discardLessonDraft(lessonId)}
        >
          <X className="size-3.5" />
          Discard
        </Button>
      </div>

      <div className="px-4 py-3">
        <p className="mb-3 text-[0.8125rem] text-fg-secondary">
          Nothing is saved to {""}the student&rsquo;s record until you approve
          it. Uncheck anything wrong, edit anything imprecise.
        </p>

        <SectionTitle count={1}>Summary</SectionTitle>
        <Textarea
          rows={3}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />

        {topics.length > 0 && (
          <>
            <SectionTitle count={topics.length}>Topics</SectionTitle>
            <div className="space-y-1.5">
              {topics.map((t) => (
                <div key={t._key} className="flex items-center gap-2">
                  <IncludeToggle
                    included={t._included}
                    onToggle={() => toggle(setTopics, t._key)}
                  />
                  <Input
                    value={t.title}
                    onChange={(e) =>
                      setTopics((items) =>
                        items.map((i) =>
                          i._key === t._key ? { ...i, title: e.target.value } : i,
                        ),
                      )
                    }
                    className={t._included ? "" : "opacity-40"}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {corrections.length > 0 && (
          <>
            <SectionTitle count={corrections.length}>Corrections</SectionTitle>
            <div className="space-y-2">
              {corrections.map((c) => (
                <div key={c._key} className="flex items-start gap-2">
                  <IncludeToggle
                    included={c._included}
                    onToggle={() => toggle(setCorrections, c._key)}
                  />
                  <div
                    className={`grid flex-1 grid-cols-2 gap-1.5 ${c._included ? "" : "opacity-40"}`}
                  >
                    <Input
                      value={c.originalText}
                      placeholder="Original"
                      onChange={(e) =>
                        setCorrections((items) =>
                          items.map((i) =>
                            i._key === c._key
                              ? { ...i, originalText: e.target.value }
                              : i,
                          ),
                        )
                      }
                    />
                    <Input
                      value={c.correctedText}
                      placeholder="Corrected"
                      onChange={(e) =>
                        setCorrections((items) =>
                          items.map((i) =>
                            i._key === c._key
                              ? { ...i, correctedText: e.target.value }
                              : i,
                          ),
                        )
                      }
                    />
                    <div className="col-span-2 flex items-center gap-2">
                      <Badge>{correctionCategoryLabel[c.category]}</Badge>
                      {c.uncertain && <Badge tone="warning">uncertain</Badge>}
                      {c.explanation && (
                        <span className="truncate text-[0.8125rem] text-fg-tertiary">
                          {c.explanation}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {vocabulary.length > 0 && (
          <>
            <SectionTitle count={vocabulary.length}>Vocabulary</SectionTitle>
            <div className="space-y-1.5">
              {vocabulary.map((v) => (
                <div key={v._key} className="flex items-center gap-2">
                  <IncludeToggle
                    included={v._included}
                    onToggle={() => toggle(setVocabulary, v._key)}
                  />
                  <div
                    className={`grid flex-1 grid-cols-2 gap-1.5 ${v._included ? "" : "opacity-40"}`}
                  >
                    <Input
                      value={v.term}
                      onChange={(e) =>
                        setVocabulary((items) =>
                          items.map((i) =>
                            i._key === v._key ? { ...i, term: e.target.value } : i,
                          ),
                        )
                      }
                    />
                    <Input
                      value={v.meaning ?? ""}
                      placeholder="Meaning"
                      onChange={(e) =>
                        setVocabulary((items) =>
                          items.map((i) =>
                            i._key === v._key
                              ? { ...i, meaning: e.target.value }
                              : i,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {homework.length > 0 && (
          <>
            <SectionTitle count={homework.length}>Homework</SectionTitle>
            <div className="space-y-1.5">
              {homework.map((h) => (
                <div key={h._key} className="flex items-center gap-2">
                  <IncludeToggle
                    included={h._included}
                    onToggle={() => toggle(setHomework, h._key)}
                  />
                  <Input
                    value={h.title}
                    onChange={(e) =>
                      setHomework((items) =>
                        items.map((i) =>
                          i._key === h._key ? { ...i, title: e.target.value } : i,
                        ),
                      )
                    }
                    className={h._included ? "" : "opacity-40"}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {insights.length > 0 && (
          <>
            <SectionTitle count={insights.length}>
              Insights (private)
            </SectionTitle>
            <div className="space-y-1.5">
              {insights.map((ins) => (
                <div key={ins._key} className="flex items-center gap-2">
                  <IncludeToggle
                    included={ins._included}
                    onToggle={() => toggle(setInsights, ins._key)}
                  />
                  <Badge>{insightTypeLabel[ins.type]}</Badge>
                  <Input
                    value={ins.title}
                    onChange={(e) =>
                      setInsights((items) =>
                        items.map((i) =>
                          i._key === ins._key ? { ...i, title: e.target.value } : i,
                        ),
                      )
                    }
                    className={ins._included ? "" : "opacity-40"}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        <SectionTitle count={1}>Next lesson suggestion</SectionTitle>
        <Textarea
          rows={2}
          value={nextFocus}
          onChange={(e) => setNextFocus(e.target.value)}
        />

        {error && <p className="mt-3 text-[0.875rem] text-danger">{error}</p>}

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="text-[0.8125rem] text-fg-tertiary">
            {includedCount} item{includedCount === 1 ? "" : "s"} will be saved
          </span>
          <Button variant="primary" loading={pending} onClick={save}>
            <Check className="size-3.5" />
            Save approved items
          </Button>
        </div>
      </div>
    </Card>
  );
}
