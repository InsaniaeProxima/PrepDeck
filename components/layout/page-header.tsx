"use client";

import { useState } from "react";
import { GraduationCap, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstallPWA } from "@/components/install-pwa";
import { SettingsModal } from "@/components/settings/settings-modal";

export function PageHeader() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <header className="border-b border-border/50 bg-card/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto flex items-center gap-3 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 ring-1 ring-primary/40">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-semibold leading-none">PrepDeck</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Certification Study Platform
            </p>
          </div>

          {/* Right-side header actions */}
          <div className="flex items-center gap-2">
            <InstallPWA />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
