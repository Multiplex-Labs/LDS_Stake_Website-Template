import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Phone } from "lucide-react";

const bishops = [
  { id: 1, wardNumber: 9,  ward: "Logan Married Student 9th Ward",  name: "", phone: "" },
  { id: 2, wardNumber: 10, ward: "Logan Married Student 10th Ward", name: "", phone: "" },
  { id: 3, wardNumber: 11, ward: "Logan Married Student 11th Ward", name: "", phone: "" },
  { id: 4, wardNumber: 12, ward: "Logan Married Student 12th Ward", name: "", phone: "" },
  { id: 5, wardNumber: 13, ward: "Logan Married Student 13th Ward", name: "", phone: "" },
  { id: 6, wardNumber: 14, ward: "Logan Married Student 14th Ward", name: "", phone: "" },
  { id: 7, wardNumber: 15, ward: "Logan Married Student 15th Ward", name: "", phone: "" },
  { id: 8, wardNumber: 16, ward: "Logan Married Student 16th Ward", name: "", phone: "" },
  { id: 9, wardNumber: 17, ward: "Logan Married Student 17th Ward", name: "", phone: "" },
];

export default function MeetOurBishops() {
  return (
    <Layout>
      <div className="bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <h1 className="font-serif text-4xl font-bold text-center mb-4">Meet Our Bishops</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {bishops.map((bishop) => {
            const isEmpty = !bishop.name;
            return (
              <Card key={bishop.id} className="overflow-hidden hover:shadow-lg transition-shadow border-t-4 border-t-primary flex flex-col">
                <CardHeader className="text-center pb-2">
                  <div className="w-20 h-20 mx-auto bg-muted rounded-full flex items-center justify-center text-xl font-serif text-muted-foreground mb-3 border-4 border-background shadow-sm">
                    {isEmpty ? (
                      <span className="skeleton w-full h-full rounded-full" />
                    ) : (
                      bishop.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()
                    )}
                  </div>
                  {isEmpty ? (
                    <>
                      <div className="skeleton h-5 w-36 rounded mx-auto" />
                      <div className="skeleton h-3 w-44 rounded mx-auto mt-2" />
                    </>
                  ) : (
                    <>
                      <CardTitle className="font-serif text-xl">Bishop {bishop.name}</CardTitle>
                      <CardDescription className="text-primary font-medium uppercase tracking-wide text-xs mt-1">
                        {bishop.ward}
                      </CardDescription>
                    </>
                  )}
                </CardHeader>
                <CardContent className="flex-1 flex flex-col pt-2">
                  <div className="space-y-3 mt-auto pt-4 border-t text-sm">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Phone className="w-4 h-4 text-primary" />
                      {isEmpty ? (
                        <div className="skeleton h-4 w-28 rounded" />
                      ) : (
                        <span>{bishop.phone}</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
