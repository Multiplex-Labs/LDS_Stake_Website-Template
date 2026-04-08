import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Placeholder Data for Backend Integration
const STAKE_VARS = {
  stake_pres_fullname: "",
  stake_pres_bio: "",
  stake_1c_fullname: "",
  stake_1c_bio: "",
  stake_2c_fullname: "",
  stake_2c_bio: "",
  stake_execsec_fullname: "",
  stake_clerk_fullname: "",

  // Relief Society
  stake_rspres_fullname: "",
  stake_rs1c_fullname: "",
  stake_rs2c_fullname: "",

  // Primary
  stake_pripres_fullname: "",
  stake_pri1c_fullname: "",
  stake_pri2c_fullname: "",
};

// High Council Variables (1-12)
const HIGH_COUNCIL_VARS = Array.from({ length: 12 }).map((_, i) => ({
  name: "",
  id: i + 1
}));

export default function StakeLeadership() {
  return (
    <Layout>
      <div className="bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <h1 className="font-serif text-4xl font-bold text-center mb-4">Stake Leadership</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <LeaderCard
            name={STAKE_VARS.stake_pres_fullname}
            prefix="President"
            role="Stake President"
            bio={STAKE_VARS.stake_pres_bio}
          />
          <LeaderCard
            name={STAKE_VARS.stake_1c_fullname}
            prefix="President"
            role="1st Counselor"
            bio={STAKE_VARS.stake_1c_bio}
          />
          <LeaderCard
            name={STAKE_VARS.stake_2c_fullname}
            prefix="President"
            role="2nd Counselor"
            bio={STAKE_VARS.stake_2c_bio}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto mt-8">
          <LeaderCard
            name={STAKE_VARS.stake_execsec_fullname}
            prefix="Brother"
            role="Stake Executive Secretary"
            size="sm"
          />
          <LeaderCard
            name={STAKE_VARS.stake_clerk_fullname}
            prefix="Brother"
            role="Stake Clerk"
            size="sm"
          />
        </div>

        <div className="mt-20">
          <h2 className="font-serif text-3xl font-bold text-center mb-12">High Council</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {HIGH_COUNCIL_VARS.map((hc) => (
              <div key={hc.id} className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <Avatar>
                  <AvatarFallback>HC</AvatarFallback>
                </Avatar>
                <div>
                  {hc.name ? (
                    <>
                      <div className="font-semibold">Brother {hc.name}</div>
                      <div className="text-xs text-muted-foreground">High Councilor {hc.id}</div>
                    </>
                  ) : (
                    <>
                      <div className="skeleton h-4 w-28 rounded" />
                      <div className="skeleton h-3 w-20 rounded mt-1" />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-20">
          <h2 className="font-serif text-3xl font-bold text-center mb-12">Stake Relief Society Presidency</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <LeaderCard name={STAKE_VARS.stake_rspres_fullname} prefix="Sister" role="President" size="sm" />
            <LeaderCard name={STAKE_VARS.stake_rs1c_fullname} prefix="Sister" role="1st Counselor" size="sm" />
            <LeaderCard name={STAKE_VARS.stake_rs2c_fullname} prefix="Sister" role="2nd Counselor" size="sm" />
          </div>
        </div>

        <div className="mt-20">
          <h2 className="font-serif text-3xl font-bold text-center mb-12">Stake Primary Presidency</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <LeaderCard name={STAKE_VARS.stake_pripres_fullname} prefix="Sister" role="President" size="sm" />
            <LeaderCard name={STAKE_VARS.stake_pri1c_fullname} prefix="Sister" role="1st Counselor" size="sm" />
            <LeaderCard name={STAKE_VARS.stake_pri2c_fullname} prefix="Sister" role="2nd Counselor" size="sm" />
          </div>
        </div>
      </div>
    </Layout>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

interface LeaderCardProps {
  name: string;
  prefix?: string;
  role: string;
  bio?: string;
  size?: "sm" | "md";
}

function LeaderCard({ name, prefix, role, bio, size = "md" }: LeaderCardProps) {
  const isEmpty = !name;
  const sm = size === "sm";

  return (
    <Card className="text-center overflow-hidden hover:shadow-lg transition-shadow border-t-4 border-t-primary">
      <CardHeader className={sm ? "pb-2 pt-6" : ""}>
        <div className={cn(
          "mx-auto bg-muted rounded-full flex items-center justify-center font-serif text-muted-foreground mb-4 border-4 border-background shadow-sm",
          sm ? "w-16 h-16 text-xl" : "w-24 h-24 text-2xl"
        )}>
          {isEmpty ? (
            <span className="skeleton w-full h-full rounded-full" />
          ) : (
            getInitials(name)
          )}
        </div>
        {isEmpty ? (
          <>
            <div className={cn("skeleton rounded mx-auto", sm ? "h-5 w-32" : "h-6 w-40")} />
            <div className="skeleton h-3 w-24 rounded mx-auto mt-1" />
          </>
        ) : (
          <>
            <CardTitle className={cn("font-serif", sm ? "text-xl" : "text-2xl")}>
              {prefix} {name}
            </CardTitle>
            <CardDescription className="text-primary font-medium uppercase tracking-wide text-xs">{role}</CardDescription>
          </>
        )}
      </CardHeader>
      {!isEmpty && bio && (
        <CardContent>
          <p className="text-muted-foreground leading-relaxed text-sm">{bio}</p>
        </CardContent>
      )}
    </Card>
  );
}
