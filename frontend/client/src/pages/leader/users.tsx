import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ApiUser } from "@/types";

type SortKey = "name" | "active" | "email";
type SortConfig = { key: SortKey; direction: "asc" | "desc" } | null;

interface EditForm {
  fname: string;
  lname: string;
  email: string;
  phone: string;
  bio: string;
  active: boolean;
}

interface AddForm {
  fname: string;
  lname: string;
  email: string;
  phone: string;
  bio: string;
  password: string;
  confirmPassword: string;
}

export default function UserAdmin() {
  const { data: users = [], isLoading, isError } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const [editingUser, setEditingUser] = useState<ApiUser | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>({
    fname: "", lname: "", email: "", phone: "", bio: "", password: "", confirmPassword: "",
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (user: ApiUser) =>
      apiRequest("PUT", `/api/users/${user.id}`, {
        email: user.email,
        force_password_reset: user.force_password_reset,
        fname: user.fname,
        lname: user.lname,
        active: !user.active,
        phone: user.phone,
        bio: user.bio,
        profile_image: user.profile_image,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
      toast.success("Status Updated");
    },
    onError: () => toast.error("Update Failed", { description: "Could not update user status." }),
  });

  const saveEditMutation = useMutation({
    mutationFn: ({ user, form }: { user: ApiUser; form: EditForm }) =>
      apiRequest("PUT", `/api/users/${user.id}`, {
        email: form.email,
        force_password_reset: user.force_password_reset,
        fname: form.fname,
        lname: form.lname,
        active: form.active,
        phone: form.phone || null,
        bio: form.bio || null,
        profile_image: user.profile_image,
      }),
    onSuccess: (_, { form }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
      toast.success("Profile Updated", { description: `${form.fname} ${form.lname} has been saved.` });
      setEditingUser(null);
      setEditForm(null);
    },
    onError: () => toast.error("Update Failed", { description: "Could not save changes." }),
  });

  const createUserMutation = useMutation({
    mutationFn: (form: AddForm) =>
      apiRequest("POST", "/api/users/", {
        email: form.email,
        force_password_reset: true,
        fname: form.fname,
        lname: form.lname,
        active: true,
        phone: form.phone || null,
        bio: form.bio || null,
        profile_image: null,
        password: form.password,
      }),
    onSuccess: (_, form) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
      toast.success("User Created", { description: `${form.fname} ${form.lname} has been added.` });
      setIsAddingUser(false);
      setAddForm({ fname: "", lname: "", email: "", phone: "", bio: "", password: "", confirmPassword: "" });
    },
    onError: () => toast.error("Create Failed", { description: "Could not create user. Email may already be in use." }),
  });

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) =>
      prev?.key === key && prev.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" }
    );
  };

  const filteredUsers = useMemo(() => {
    return users
      .filter((user) => {
        const fullName = `${user.fname} ${user.lname}`.toLowerCase();
        const lower = searchTerm.toLowerCase();
        return fullName.includes(lower) || user.email.toLowerCase().includes(lower);
      })
      .sort((a, b) => {
        if (!sortConfig) return 0;
        const { key, direction } = sortConfig;
        let va = "", vb = "";
        if (key === "name") {
          va = `${a.fname} ${a.lname}`;
          vb = `${b.fname} ${b.lname}`;
        } else if (key === "active") {
          va = a.active ? "Active" : "Inactive";
          vb = b.active ? "Active" : "Inactive";
        } else {
          va = a.email;
          vb = b.email;
        }
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return direction === "asc" ? cmp : -cmp;
      });
  }, [users, searchTerm, sortConfig]);

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.length === filteredUsers.length ? [] : filteredUsers.map((u) => u.id)
    );
  };

  const handleOpenEdit = (user: ApiUser) => {
    setEditingUser(user);
    setEditForm({
      fname: user.fname,
      lname: user.lname,
      email: user.email,
      phone: user.phone ?? "",
      bio: user.bio ?? "",
      active: user.active,
    });
  };

  const handleAddUser = () => {
    if (!addForm.fname || !addForm.lname || !addForm.email || !addForm.password) {
      toast.error("Missing Information", { description: "Please fill in all required fields." });
      return;
    }
    if (addForm.password !== addForm.confirmPassword) {
      toast.error("Password Mismatch", { description: "Passwords do not match." });
      return;
    }
    createUserMutation.mutate(addForm);
  };

  const getStatusBadge = (active: boolean) => (active ? "badge-success" : "badge-error");

  if (isError) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-destructive">Failed to load users. Please refresh.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-6 py-8 max-w-[1400px]">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-foreground">User Administration</h1>
        </div>

        <div className="flex justify-between items-center mb-6 gap-4">
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email"
              className="pl-10 h-10 bg-background border-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 gap-2 border-input text-foreground bg-background hover:bg-accent hover:text-accent-foreground">
                  Sort by
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Sort Columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleSort("name")}>Name</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort("active")}>Status</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort("email")}>Email</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button className="h-10 gap-2 shadow-sm" onClick={() => setIsAddingUser(true)}>
              Add User
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50 border-border">
                <TableHead className="w-[50px] pl-4">
                  <Checkbox
                    checked={selectedIds.length === filteredUsers.length && filteredUsers.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => handleSort("name")}>
                  <div className="flex items-center gap-1">
                    User
                    {sortConfig?.key === "name" && <ArrowUpDown className="h-3 w-3" />}
                  </div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => handleSort("active")}>
                  <div className="flex items-center gap-1">
                    Status
                    {sortConfig?.key === "active" && <ArrowUpDown className="h-3 w-3" />}
                  </div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Callings
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-4"><div className="skeleton h-4 w-4 rounded" /></TableCell>
                    <TableCell><div className="skeleton h-4 w-40 rounded" /></TableCell>
                    <TableCell><div className="skeleton h-4 w-16 rounded" /></TableCell>
                    <TableCell><div className="skeleton h-4 w-32 rounded" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : filteredUsers.map((user) => (
                <TableRow key={user.id} className="hover:bg-muted/50 group border-border">
                  <TableCell className="pl-4">
                    <Checkbox
                      checked={selectedIds.includes(user.id)}
                      onCheckedChange={() =>
                        setSelectedIds((prev) =>
                          prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id]
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3 py-1">
                      <Avatar className="h-9 w-9 bg-primary text-primary-foreground">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                          {user.fname[0]}{user.lname[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm text-foreground">{user.fname} {user.lname}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`badge text-xs ${getStatusBadge(user.active)}`}>
                      {user.active ? "Active" : "Disabled"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">
                    {user.callings?.map((c) => c.calling.name).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-medium"
                        disabled={toggleStatusMutation.isPending}
                        onClick={() => toggleStatusMutation.mutate(user)}
                      >
                        {user.active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-medium"
                        onClick={() => handleOpenEdit(user)}
                      >
                        Edit
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) { setEditingUser(null); setEditForm(null); } }}>
          <DialogContent className="max-w-[90vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl">Edit User Profile</DialogTitle>
            </DialogHeader>

            {editingUser && editForm && (
              <div className="grid gap-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input value={editForm.fname} onChange={(e) => setEditForm({ ...editForm, fname: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input value={editForm.lname} onChange={(e) => setEditForm({ ...editForm, lname: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Optional" />
                </div>
                <div className="space-y-2">
                  <Label>Bio</Label>
                  <Textarea
                    value={editForm.bio}
                    onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                    placeholder="Brief description or notes..."
                    className="min-h-[100px]"
                  />
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => { setEditingUser(null); setEditForm(null); }}>Cancel</Button>
              <Button
                disabled={saveEditMutation.isPending}
                onClick={() => editingUser && editForm && saveEditMutation.mutate({ user: editingUser, form: editForm })}
              >
                {saveEditMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add User Dialog */}
        <Dialog open={isAddingUser} onOpenChange={setIsAddingUser}>
          <DialogContent className="max-w-[90vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl">Add New User</DialogTitle>
            </DialogHeader>

            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name <span className="text-destructive">*</span></Label>
                  <Input value={addForm.fname} onChange={(e) => setAddForm({ ...addForm, fname: e.target.value })} placeholder="John" />
                </div>
                <div className="space-y-2">
                  <Label>Last Name <span className="text-destructive">*</span></Label>
                  <Input value={addForm.lname} onChange={(e) => setAddForm({ ...addForm, lname: e.target.value })} placeholder="Doe" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} placeholder="john@example.com" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} placeholder="Optional" />
              </div>
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border border-border">
                <div className="space-y-2">
                  <Label>Password <span className="text-destructive">*</span></Label>
                  <Input type="password" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} placeholder="••••••••" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password <span className="text-destructive">*</span></Label>
                  <Input type="password" value={addForm.confirmPassword} onChange={(e) => setAddForm({ ...addForm, confirmPassword: e.target.value })} placeholder="••••••••" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Bio</Label>
                <Textarea value={addForm.bio} onChange={(e) => setAddForm({ ...addForm, bio: e.target.value })} placeholder="Brief description or notes..." className="min-h-[80px]" />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsAddingUser(false)}>Cancel</Button>
              <Button onClick={handleAddUser} disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? "Creating…" : "Create User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
