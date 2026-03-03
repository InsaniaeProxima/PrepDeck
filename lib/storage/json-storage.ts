import fs from "fs/promises";
import path from "path";
import type { Exam, EngineState, ExamProgress, ExamMeta } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const EXAMS_DIR = path.join(DATA_DIR, "exams");
const ENGINE_DIR = path.join(DATA_DIR, "engine-state");
const PROGRESS_DIR = path.join(DATA_DIR, "progress");

async function ensureDirs() {
  await Promise.all([
    fs.mkdir(EXAMS_DIR, { recursive: true }),
    fs.mkdir(ENGINE_DIR, { recursive: true }),
    fs.mkdir(PROGRESS_DIR, { recursive: true }),
  ]);
}

// ─── Exam ─────────────────────────────────────────────────────────────────────

export async function saveExam(exam: Exam): Promise<void> {
  await ensureDirs();
  await fs.writeFile(
    path.join(EXAMS_DIR, `${exam.id}.json`),
    JSON.stringify(exam, null, 2),
    "utf-8"
  );
}

export async function loadExam(id: string): Promise<Exam | null> {
  try {
    const raw = await fs.readFile(path.join(EXAMS_DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw) as Exam;
  } catch {
    return null;
  }
}

export async function listExams(): Promise<Exam[]> {
  await ensureDirs();
  let files: string[];
  try {
    files = await fs.readdir(EXAMS_DIR);
  } catch {
    return [];
  }
  const exams = await Promise.all(
    files
      .filter((f) => f.endsWith(".json") && f !== "_index.json")
      .map((f) => loadExam(f.replace(".json", "")))
  );
  return exams.filter(Boolean) as Exam[];
}

export async function deleteExam(id: string): Promise<void> {
  await Promise.allSettled([
    fs.unlink(path.join(EXAMS_DIR, `${id}.json`)),
    fs.unlink(path.join(ENGINE_DIR, `${id}.json`)),
    fs.unlink(path.join(PROGRESS_DIR, `${id}.json`)),
  ]);
}

// ─── Exam Metadata Index ───────────────────────────────────────────────────────

const INDEX_PATH = path.join(EXAMS_DIR, "_index.json");

/** Read the index file. If absent, rebuild it from existing exam files (migration). */
export async function loadExamIndex(): Promise<Record<string, ExamMeta>> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(INDEX_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { version: number; exams: Record<string, ExamMeta> };
    return parsed.exams ?? {};
  } catch {
    // File does not exist (first boot) — rebuild from full exam files.
    return rebuildExamIndex();
  }
}

/** Write the full index object to disk. */
export async function saveExamIndex(index: Record<string, ExamMeta>): Promise<void> {
  await ensureDirs();
  await fs.writeFile(INDEX_PATH, JSON.stringify({ version: 1, exams: index }, null, 2), "utf-8");
}

/** Insert or update a single entry in the index for the given exam. */
export async function upsertExamMeta(exam: Exam): Promise<void> {
  const index = await loadExamIndex();
  index[exam.id] = {
    id: exam.id,
    provider: exam.provider,
    examCode: exam.examCode,
    totalLinks: exam.totalLinks,
    fetchedCount: exam.fetchedCount,
    questionCount: exam.questions.length,
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt,
  };
  await saveExamIndex(index);
}

/** Update the customName on both the exam file and the index entry. */
export async function updateExamCustomName(id: string, customName: string): Promise<void> {
  const exam = await loadExam(id);
  if (!exam) return;
  exam.customName = customName || undefined;
  await saveExam(exam);
  const index = await loadExamIndex();
  if (index[id]) {
    index[id].customName = customName || undefined;
    await saveExamIndex(index);
  }
}

/** Remove a single entry from the index (called on DELETE). */
export async function removeExamMeta(examId: string): Promise<void> {
  const index = await loadExamIndex();
  delete index[examId];
  await saveExamIndex(index);
}

/**
 * Rebuild the index from scratch by reading every exam JSON file.
 * Called automatically by loadExamIndex() when _index.json is missing.
 */
export async function rebuildExamIndex(): Promise<Record<string, ExamMeta>> {
  const exams = await listExams();
  const index: Record<string, ExamMeta> = {};
  for (const exam of exams) {
    index[exam.id] = {
      id: exam.id,
      provider: exam.provider,
      examCode: exam.examCode,
      totalLinks: exam.totalLinks,
      fetchedCount: exam.fetchedCount,
      questionCount: exam.questions.length,
      createdAt: exam.createdAt,
      updatedAt: exam.updatedAt,
    };
  }
  await saveExamIndex(index);
  return index;
}

// ─── Engine State ──────────────────────────────────────────────────────────────

export async function saveEngineState(state: EngineState): Promise<void> {
  await ensureDirs();
  await fs.writeFile(
    path.join(ENGINE_DIR, `${state.examId}.json`),
    JSON.stringify(state, null, 2),
    "utf-8"
  );
}

export async function loadEngineState(
  examId: string
): Promise<EngineState | null> {
  try {
    const raw = await fs.readFile(
      path.join(ENGINE_DIR, `${examId}.json`),
      "utf-8"
    );
    return JSON.parse(raw) as EngineState;
  } catch {
    return null;
  }
}

// ─── Progress ──────────────────────────────────────────────────────────────────

export async function saveProgress(progress: ExamProgress): Promise<void> {
  await ensureDirs();
  await fs.writeFile(
    path.join(PROGRESS_DIR, `${progress.examId}.json`),
    JSON.stringify(progress, null, 2),
    "utf-8"
  );
}

export async function loadProgress(
  examId: string
): Promise<ExamProgress | null> {
  try {
    const raw = await fs.readFile(
      path.join(PROGRESS_DIR, `${examId}.json`),
      "utf-8"
    );
    return JSON.parse(raw) as ExamProgress;
  } catch {
    return null;
  }
}

// ─── Activity Heatmap ─────────────────────────────────────────────────────────

const ACTIVITY_PATH = path.join(DATA_DIR, "activity.json");

export async function loadActivity(): Promise<Record<string, { answered: number }>> {
  try {
    const raw = await fs.readFile(ACTIVITY_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function incrementActivity(date: string): Promise<void> {
  const data = await loadActivity();
  data[date] = { answered: (data[date]?.answered ?? 0) + 1 };
  await fs.writeFile(ACTIVITY_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export async function resetActivity(): Promise<void> {
  await fs.writeFile(ACTIVITY_PATH, "{}", "utf-8");
}
