import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { Layout } from "@/components/layout/Layout";

const assignments = [
  { name: "High Councilor 1", spouse: "High Councilor 1 Spouse", phone: "{HC 1 Phone Number}", ward: "14th", assignment: "Temple & Family History", committee: "Activity Committee" },
  { name: "High Councilor 2", spouse: "High Councilor 2 Spouse", phone: "{HC 2 Phone Number}", ward: "10th", assignment: "Blood Drive", committee: "Audit Committee" },
  { name: "High Councilor 3", spouse: "High Councilor 3 Spouse", phone: "{HC 3 Phone Number}", ward: "13th", assignment: "IT, Stake Housing Specialist", committee: "Activity Committee" },
  { name: "High Councilor 4", spouse: "High Councilor 4 Spouse", phone: "{HC 4 Phone Number}", ward: "16th", assignment: "Relief Society", committee: "Audit Committee" },
  { name: "High Councilor 5", spouse: "High Councilor 5 Spouse", phone: "{HC 5 Phone Number}", ward: "11th", assignment: "Primary", committee: "Auditor 15,16,17" },
  { name: "High Councilor 6", spouse: "High Councilor 6 Spouse", phone: "{HC 6 Phone Number}", ward: "-", assignment: "Emergency Preparedness, Sports", committee: "Activity Committee" },
  { name: "High Councilor 7", spouse: "High Councilor 7 Spouse", phone: "{HC 7 Phone Number}", ward: "12th", assignment: "Sports", committee: "Auditor 9,12,14" },
  { name: "High Councilor 8", spouse: "High Councilor 8 Spouse", phone: "{HC 8 Phone Number}", ward: "-", assignment: "Missionary Work, Service Opportunities", committee: "Activity Committee" },
  { name: "High Councilor 9", spouse: "High Councilor 9 Spouse", phone: "{HC 9 Phone Number}", ward: "15th", assignment: "Music", committee: "Audit Committee" },
  { name: "High Councilor 10", spouse: "High Councilor 10 Spouse", phone: "{HC 10 Phone Number}", ward: "-", assignment: "Sunday School President, Self Reliance, Institute, Education", committee: "Activity Committee" },
  { name: "High Councilor 11", spouse: "High Councilor 11 Spouse", phone: "{HC 11 Phone Number}", ward: "17th", assignment: "Welfare, Chairman of Activity Committee", committee: "Activity Committee" },
  { name: "High Councilor 12", spouse: "High Councilor 12 Spouse", phone: "{HC 12 Phone Number}", ward: "9th", assignment: "Physical Facilities", committee: "Auditor 10,11,13" },
];

export default function HighCouncilAssignments() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">High Council Assignments</h1>
          <Button variant="outline" size="sm" className="gap-2">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">High Councilor</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Ward</TableHead>
                    <TableHead className="w-[300px]">Stake Presidency Assignment</TableHead>
                    <TableHead>Committee Assignment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{item.name}</span>
                          <span className="text-xs text-muted-foreground font-normal">{item.spouse}</span>
                        </div>
                      </TableCell>
                      <TableCell>{item.phone}</TableCell>
                      <TableCell>{item.ward}</TableCell>
                      <TableCell>{item.assignment}</TableCell>
                      <TableCell>{item.committee}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 text-sm text-muted-foreground text-right">
              Current as of - August 3, 2025
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
