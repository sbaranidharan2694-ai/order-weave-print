import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-[#F8FAFC] p-4">
      <div className="text-center space-y-6 max-w-md">
        <FileQuestion className="h-16 w-16 mx-auto text-[#F97316] opacity-80" />
        <h1 className="text-5xl font-bold text-[#1E293B]">404</h1>
        <p className="text-xl text-muted-foreground font-medium">Page not found</p>
        <p className="text-sm text-muted-foreground">
          The page <code className="bg-[#F1F5F9] text-[#374151] px-2 py-0.5 rounded text-xs font-mono">{location.pathname}</code> does not exist.
        </p>
        <Button onClick={() => navigate("/")} className="bg-[#F97316] hover:bg-[#ea580c] text-white" style={{ backgroundColor: "#F97316" }}>
          Return to Home
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
