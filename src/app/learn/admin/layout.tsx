import { ClassroomTabs } from "@/components/learn/ClassroomTabs";

// The Classroom tab strip appears on the classroom routes only (it hides
// itself elsewhere).
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ClassroomTabs />
      {children}
    </>
  );
}
