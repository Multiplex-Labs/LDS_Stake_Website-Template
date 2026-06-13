import { X, Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export interface WizardStep {
  id: number;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  skippable?: boolean;
}

export interface WizardShellProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  steps: readonly WizardStep[];
  stepIndex: number; // 0-based index of active step
  onBack: () => void;
  onNext: () => void;
  onSkip?: () => void; // called when user clicks Skip on a skippable step
  onStepSelect?: (id: number) => void; // called when user clicks a completed breadcrumb
  onSubmit: () => void;
  submitLabel?: string; // default "Save"
  isPending?: boolean;
  children: React.ReactNode; // the step-specific content
  dialogClassName?: string; // allows callers to override max-w etc.
}

export function WizardShell({
  open,
  onOpenChange,
  steps,
  stepIndex,
  onBack,
  onNext,
  onSkip,
  onStepSelect,
  onSubmit,
  submitLabel = "Save",
  isPending = false,
  children,
  dialogClassName,
}: WizardShellProps) {
  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const displayStep = stepIndex + 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-[90vw] sm:max-w-md p-0 gap-0 overflow-hidden [&>button:last-child]:hidden",
          dialogClassName,
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-muted-foreground">{currentStep.icon}</span>
            <div>
              <span className="font-medium text-sm">{currentStep.label}</span>
              <p className="text-muted-foreground text-xs">
                Step {displayStep} of {steps.length}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-3.5" />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 border-b px-4 py-2.5">
          {steps.map((s, index) => (
            <div
              key={s.id}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                index < stepIndex
                  ? "bg-primary"
                  : index === stepIndex
                    ? "bg-primary/60"
                    : "bg-muted-foreground/15",
              )}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-4 py-4">
          {currentStep.description && (
            <p className="mb-4 text-muted-foreground text-xs">
              {currentStep.description}
            </p>
          )}
          {children}
        </div>

        {/* Step breadcrumbs */}
        <div className="border-t px-4 py-2.5">
          <div className="flex items-center gap-2">
            {steps.map((s, index) => {
              const isCompleted = index < stepIndex;
              const isActive = index === stepIndex;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (isCompleted) onStepSelect?.(s.id);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                    isActive
                      ? "bg-muted font-medium text-foreground"
                      : isCompleted
                        ? "text-muted-foreground hover:bg-muted/50"
                        : "cursor-default text-muted-foreground/50",
                  )}
                >
                  {isCompleted ? (
                    <Check className="size-3 text-primary" />
                  ) : (
                    <span className="tabular-nums">{index + 1}</span>
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onBack}
            disabled={stepIndex === 0}
          >
            Back
          </Button>
          <Badge variant="secondary" className="font-normal text-xs tabular-nums">
            {displayStep}/{steps.length}
          </Badge>
          <div className="flex gap-2">
            {isLastStep && currentStep.skippable && onSkip && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={onSkip}
              >
                Skip
              </Button>
            )}
            {!isLastStep ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={onNext}
              >
                Next <ChevronRight className="size-3" />
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={onSubmit}
                disabled={isPending}
              >
                {isPending ? "Saving…" : submitLabel}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
