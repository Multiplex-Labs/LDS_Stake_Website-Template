import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Users, Pencil } from "lucide-react";

const ASSIGNMENTS = [
  {
    role: "Stake President",
    name: "President [Name]",
    responsibilities: [
      "Bishops",
      "Relief Society",
      "Stake Patriarch",
      "High Council",
      "First time Temple Interviews",
      "Coordinating Council",
      "Stake Council",
      "General Conference Tickets"
    ]
  },
  {
    role: "First Counselor",
    name: "President [Name]",
    responsibilities: [
      "Sunday School",
      "Emergency Preparedness",
      "Blood Drive",
      "Welfare and Self Reliance",
      "Temple and Family History",
      "Stake Finances/Records",
      "Music"
    ],
    wards: ["9th Ward", "10th Ward", "11th Ward", "12th Ward"]
  },
  {
    role: "Second Counselor",
    name: "President [Name]",
    responsibilities: [
      "Physical Facilities",
      "Technology",
      "Institute",
      "Audits",
      "Stake Activities",
      "Primary",
      "Missionary Work"
    ],
    wards: ["13th Ward", "14th Ward", "15th Ward", "16th Ward", "17th Ward"]
  }
];

export default function PresidencyAssignments() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-primary mb-8">Stake Presidency Assignments</h1>

        <div className="grid gap-6 md:grid-cols-3">
          {ASSIGNMENTS.map((member, index) => (
            <Card key={index} className="flex flex-col h-full border-t-4 border-t-primary shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-col gap-1">
                  <span className="text-2xl font-bold">{member.name}</span>
                  <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium uppercase tracking-wide">
                    {member.role}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 space-y-6">
                <div>
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    Responsibilities
                  </h3>
                  <ul className="space-y-2">
                    {member.responsibilities.map((resp, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/40 mt-1.5 shrink-0" />
                        <span>{resp}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {member.wards && (
                  <div>
                    <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Elder Quorum Presidencies
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {member.wards.map((ward, i) => (
                        <Badge key={i} variant="secondary" className="bg-primary/5 text-primary hover:bg-primary/10 border-primary/20">
                          {ward}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="flex justify-end mt-8">
          <Button variant="outline" size="sm" className="gap-2">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>
    </Layout>
  );
}
