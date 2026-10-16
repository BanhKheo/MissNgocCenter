import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, patch, post, put } from './client';
import type {
  AnswerKeyGrid,
  AuditLogRow,
  ClassRow,
  ExamRow,
  GradingRunProgress,
  Option,
  Paged,
  PermissionGroup,
  QuestionStatsVersion,
  ReportGrid,
  ReportTemplateConfig,
  RoleDetail,
  RoleRow,
  StudentRow,
  SubmissionDetail,
  SubmissionRow,
  UserRow,
} from './types';

export const qk = {
  classes: (params?: object) => ['classes', params ?? {}] as const,
  classOptions: ['classes', 'options'] as const,
  class: (id: string) => ['classes', id] as const,
  students: (classId: string) => ['classes', classId, 'students'] as const,
  exams: (params?: object) => ['exams', params ?? {}] as const,
  exam: (id: string) => ['exams', id] as const,
  answerKeys: (examId: string) => ['exams', examId, 'answer-keys'] as const,
  submissions: (examId: string) => ['exams', examId, 'submissions'] as const,
  submission: (id: string) => ['submissions', id] as const,
  report: (examId: string) => ['exams', examId, 'report'] as const,
  stats: (examId: string) => ['exams', examId, 'stats'] as const,
  latestRun: (examId: string) => ['exams', examId, 'grading-runs', 'latest'] as const,
  users: (params?: object) => ['users', params ?? {}] as const,
  userOptions: ['users', 'options'] as const,
  roles: ['roles'] as const,
  roleOptions: ['roles', 'options'] as const,
  role: (id: string) => ['roles', id] as const,
  permissions: ['permissions'] as const,
  auditLogs: (params?: object) => ['audit-logs', params ?? {}] as const,
  reportTemplate: ['report-template'] as const,
};

// ───── Lớp, học sinh ─────
export const useClasses = (params: { page: number; pageSize: number; keyword?: string; status?: string }) =>
  useQuery({ queryKey: qk.classes(params), queryFn: () => get<Paged<ClassRow>>('/classes', { params }), placeholderData: keepPreviousData });

export const useClassOptions = () => useQuery({ queryKey: qk.classOptions, queryFn: () => get<Option[]>('/classes/options') });

export const useClass = (id: string) => useQuery({ queryKey: qk.class(id), queryFn: () => get<ClassRow>(`/classes/${id}`) });

export const useStudents = (classId: string | undefined) =>
  useQuery({
    queryKey: qk.students(classId ?? ''),
    queryFn: () => get<StudentRow[]>(`/classes/${classId}/students`),
    enabled: !!classId,
  });

// ───── Bài kiểm tra ─────
export const useExams = (params: { page: number; pageSize: number; classId?: string; keyword?: string; status?: string }, enabled = true) =>
  useQuery({
    queryKey: qk.exams(params),
    queryFn: () => get<Paged<ExamRow>>('/exams', { params }),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useExam = (id: string | undefined) =>
  useQuery({ queryKey: qk.exam(id ?? ''), queryFn: () => get<ExamRow>(`/exams/${id}`), enabled: !!id });

export const useAnswerKeys = (examId: string, enabled = true) =>
  useQuery({ queryKey: qk.answerKeys(examId), queryFn: () => get<AnswerKeyGrid[]>(`/exams/${examId}/answer-keys`), enabled });

export const useSubmissions = (examId: string | undefined, refetchInterval?: number | false) =>
  useQuery({
    queryKey: qk.submissions(examId ?? ''),
    queryFn: () => get<SubmissionRow[]>(`/exams/${examId}/submissions`),
    enabled: !!examId,
    refetchInterval,
  });

export const useSubmission = (id: string | undefined) =>
  useQuery({ queryKey: qk.submission(id ?? ''), queryFn: () => get<SubmissionDetail>(`/submissions/${id}`), enabled: !!id });

export const useLatestRun = (examId: string, enabled = true) =>
  useQuery({
    queryKey: qk.latestRun(examId),
    queryFn: () => get<GradingRunProgress | null>(`/exams/${examId}/grading-runs/latest`),
    enabled,
  });

export const useReport = (examId: string) =>
  useQuery({ queryKey: qk.report(examId), queryFn: () => get<ReportGrid>(`/exams/${examId}/report`) });

export const useStats = (examId: string, enabled = true) =>
  useQuery({ queryKey: qk.stats(examId), queryFn: () => get<QuestionStatsVersion[]>(`/exams/${examId}/stats`), enabled });

// ───── Tài khoản, vai trò ─────
export const useUsers = (params: { page: number; pageSize: number; keyword?: string }) =>
  useQuery({ queryKey: qk.users(params), queryFn: () => get<Paged<UserRow>>('/iam/users', { params }), placeholderData: keepPreviousData });

export const useUserOptions = (enabled = true) =>
  useQuery({
    queryKey: qk.userOptions,
    queryFn: () => get<(Option & { role: string })[]>('/iam/users/options'),
    enabled,
  });

export const useRoles = () => useQuery({ queryKey: qk.roles, queryFn: () => get<RoleRow[]>('/iam/roles') });

export const useRoleOptions = () =>
  useQuery({ queryKey: qk.roleOptions, queryFn: () => get<(Option & { name: string })[]>('/iam/roles/options') });

export const useRole = (id: string | null) =>
  useQuery({ queryKey: qk.role(id ?? ''), queryFn: () => get<RoleDetail>(`/iam/roles/${id}`), enabled: !!id });

export const usePermissions = () =>
  useQuery({ queryKey: qk.permissions, queryFn: () => get<PermissionGroup[]>('/iam/permissions') });

export const useAuditLogs = (params: { page: number; pageSize: number; keyword?: string }) =>
  useQuery({
    queryKey: qk.auditLogs(params),
    queryFn: () => get<Paged<AuditLogRow>>('/audit-logs', { params }),
    placeholderData: keepPreviousData,
  });

export const useReportTemplate = () =>
  useQuery({ queryKey: qk.reportTemplate, queryFn: () => get<ReportTemplateConfig>('/report-templates/default') });

/** Mutation dùng chung: gọi API rồi làm mới các query liên quan */
export function useApiMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  invalidate: readonly (readonly unknown[])[] = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(invalidate.map((key) => qc.invalidateQueries({ queryKey: key })));
    },
  });
}

export const api = { get, post, put, patch, del };
