import { Navigate, Route, Routes } from 'react-router-dom';
import { PMS, RoutePaths } from '@missngoc/core';
import { AuthRehydrator } from './auth/AuthRehydrator';
import { RequireAuth, RequirePermission } from './auth/guards';
import { PhoneQr } from './components/PhoneQr';
import { useIsMobile } from './hooks/useIsMobile';
import { AppLayout } from './layouts/AppLayout';
import { useCan } from './store';
import { AuditLogsPage } from './views/admin/AuditLogsPage';
import { ReportTemplatePage } from './views/admin/ReportTemplatePage';
import { RolesPage } from './views/admin/RolesPage';
import { UsersPage } from './views/admin/UsersPage';
import { ChangePasswordPage } from './views/auth/ChangePasswordPage';
import { LoginPage } from './views/auth/LoginPage';
import { CapturePage } from './views/capture/CapturePage';
import { ClassDetailPage } from './views/classes/ClassDetailPage';
import { ClassListPage } from './views/classes/ClassListPage';
import { ExamDetailPage } from './views/exams/ExamDetailPage';
import { ExamListPage } from './views/exams/ExamListPage';
import { ReportPage } from './views/report/ReportPage';
import { ReviewQueuePage } from './views/review/ReviewQueuePage';
import { SubmissionReviewPage } from './views/review/SubmissionReviewPage';

const VIEW_EXAMS = [PMS.EXAM_AD, PMS.GRD_USER, PMS.RPT_AD, PMS.RPT_USER, PMS.CLS_AD];
const VIEW_CLASSES = [PMS.CLS_AD, PMS.EXAM_AD, PMS.GRD_USER, PMS.RPT_AD, PMS.RPT_USER];

/** Màn hình đầu: giáo vụ trên điện thoại vào thẳng Chụp bài (FR-CAP-01) */
function Home() {
  const isMobile = useIsMobile();
  const canCapture = useCan(PMS.GRD_USER);
  const canExams = useCan(...VIEW_EXAMS);
  const canUsers = useCan(PMS.USER_AD);
  if (canCapture && isMobile) return <Navigate to={RoutePaths.capture} replace />;
  if (canExams) return <Navigate to={RoutePaths.exams} replace />;
  if (canUsers) return <Navigate to={RoutePaths.users} replace />;
  return <Navigate to={RoutePaths.exams} replace />;
}

export function App() {
  return (
    <AuthRehydrator>
      <Routes>
        <Route path={RoutePaths.login} element={<LoginPage />} />
        <Route path={RoutePaths.changePassword} element={<ChangePasswordPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Home />} />
          <Route path="capture" element={<RequirePermission any={[PMS.GRD_USER]}><CapturePage /></RequirePermission>} />
          <Route path="classes" element={<RequirePermission any={VIEW_CLASSES}><ClassListPage /></RequirePermission>} />
          <Route path="classes/:id" element={<RequirePermission any={VIEW_CLASSES}><ClassDetailPage /></RequirePermission>} />
          <Route path="exams" element={<RequirePermission any={VIEW_EXAMS}><ExamListPage /></RequirePermission>} />
          <Route path="exams/:id" element={<RequirePermission any={VIEW_EXAMS}><ExamDetailPage /></RequirePermission>} />
          <Route path="exams/:id/review" element={<RequirePermission any={[PMS.GRD_USER]}><ReviewQueuePage /></RequirePermission>} />
          <Route
            path="exams/:id/review/:submissionId"
            element={<RequirePermission any={[PMS.GRD_USER, PMS.EXAM_AD, PMS.RPT_AD, PMS.RPT_USER]}><SubmissionReviewPage /></RequirePermission>}
          />
          <Route path="exams/:id/report" element={<RequirePermission any={[PMS.RPT_AD, PMS.RPT_USER]}><ReportPage /></RequirePermission>} />
          <Route path="admin/users" element={<RequirePermission any={[PMS.USER_AD]}><UsersPage /></RequirePermission>} />
          <Route path="admin/roles" element={<RequirePermission any={[PMS.USER_AD]}><RolesPage /></RequirePermission>} />
          <Route path="admin/audit-logs" element={<RequirePermission any={[PMS.SYS_AD]}><AuditLogsPage /></RequirePermission>} />
          <Route path="admin/report-template" element={<RequirePermission any={[PMS.SYS_AD]}><ReportTemplatePage /></RequirePermission>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <PhoneQr />
    </AuthRehydrator>
  );
}
