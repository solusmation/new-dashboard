import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  getCoachScheduleEdit,
  saveCoachWeeklySchedule,
  type CoachWeeklyDay,
} from "@/lib/admin-coach.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const DAY_LABELS: Record<number, string> = {
  1: "Sen",
  2: "Sel",
  3: "Rab",
  4: "Kam",
  5: "Jum",
  6: "Sab",
  7: "Min",
};

type Props = {
  coachId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditCoachScheduleDialog({ coachId, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const fetchSchedule = useServerFn(getCoachScheduleEdit);
  const saveFn = useServerFn(saveCoachWeeklySchedule);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "coach", coachId, "jadwal"],
    queryFn: () => fetchSchedule({ data: { coachId } }),
    enabled: open,
  });

  const [days, setDays] = useState<CoachWeeklyDay[]>([]);
  const [breakEnabled, setBreakEnabled] = useState(false);
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("14:00");

  useEffect(() => {
    if (!data) return;
    setDays(data.days);
    setBreakEnabled(data.dailyBreakEnabled);
    setBreakStart(data.dailyBreakStart);
    setBreakEnd(data.dailyBreakEnd);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          coachId,
          weeklyHours: days
            .filter((d) => d.enabled)
            .map((d) => ({
              day_of_week: d.day_of_week,
              start_time: d.start_time,
              end_time: d.end_time,
            })),
          dailyBreakEnabled: breakEnabled,
          dailyBreakStart: breakEnabled ? breakStart : null,
          dailyBreakEnd: breakEnabled ? breakEnd : null,
        },
      }),
    onSuccess: () => {
      toast.success("Jadwal coach berhasil disimpan.");
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "coach", coachId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "coach", coachId, "jadwal"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "coach", coachId, "hub"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateDay(dow: number, patch: Partial<CoachWeeklyDay>) {
    setDays((prev) => prev.map((d) => (d.day_of_week === dow ? { ...d, ...patch } : d)));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Jadwal</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-3">
              <h3 className="font-medium text-sm">Jam tersedia</h3>
              {days.map((day) => (
                <div key={day.day_of_week} className="flex items-center gap-3">
                  <Switch
                    checked={day.enabled}
                    onCheckedChange={(v) => updateDay(day.day_of_week, { enabled: v })}
                  />
                  <span className="w-8 text-sm font-medium">{DAY_LABELS[day.day_of_week]}</span>
                  <Input
                    type="time"
                    value={day.start_time}
                    disabled={!day.enabled}
                    onChange={(e) => updateDay(day.day_of_week, { start_time: e.target.value })}
                    className="w-[7rem]"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    value={day.end_time}
                    disabled={!day.enabled}
                    onChange={(e) => updateDay(day.day_of_week, { end_time: e.target.value })}
                    className="w-[7rem]"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="break-toggle-dlg" className="font-medium">
                    Waktu istirahat harian
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Berlaku otomatis setiap hari.
                  </p>
                </div>
                <Checkbox
                  id="break-toggle-dlg"
                  checked={breakEnabled}
                  onCheckedChange={(v) => setBreakEnabled(v === true)}
                />
              </div>
              {breakEnabled && (
                <div className="flex items-center gap-3 pl-1">
                  <Input
                    type="time"
                    value={breakStart}
                    onChange={(e) => setBreakStart(e.target.value)}
                    className="w-[7rem]"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    value={breakEnd}
                    onChange={(e) => setBreakEnd(e.target.value)}
                    className="w-[7rem]"
                  />
                </div>
              )}
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Simpan
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
