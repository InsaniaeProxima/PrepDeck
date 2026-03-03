import { ExamLibrary } from "@/components/library/exam-library";
import { StudyActivityDashboard } from "@/components/library/study-activity-dashboard";
import { PageHeader } from "@/components/layout/page-header";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <PageHeader />

      <main className="container mx-auto py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold">Exam Library</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your scraped exams. Click Study to enter a quiz session.
          </p>
        </div>
        <div className="mb-6">
          <StudyActivityDashboard />
        </div>
        <ExamLibrary />
      </main>
    </div>
  );
}
