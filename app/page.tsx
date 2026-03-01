import { GraduationCap } from "lucide-react";
import { ExamLibrary } from "@/components/library/exam-library";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto flex items-center gap-3 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 ring-1 ring-primary/40">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-none">PrepDeck</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Certification Study Platform
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold">Exam Library</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your scraped exams. Click Study to enter a quiz session.
          </p>
        </div>
        <ExamLibrary />
      </main>
    </div>
  );
}
