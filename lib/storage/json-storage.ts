import fs from "fs/promises";
import path from "path";
import type { Exam, EngineState, ExamProgress } from "@/lib/types";

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
      .filter((f) => f.endsWith(".json"))
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
