import { useState } from "react";
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Filter, 
  Plus, 
  ArrowUpDown,
  ChevronDown,
  Upload
} from "lucide-react";
import { toast } from "sonner";

interface UserData {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  avatar?: string;
  status: "Active" | "Disabled";
  permissionGroup: "Super-Admin" | "Admin" | "High Councilor" | "Stake Officer" | "Bishop" | "Custom";
  role: string;
  bio?: string;
}

const ROLES = [
  "Stake President",
  "Stake Presidency First Counselor",
  "Stake Presidency Second Counselor",
  "Stake Executive Secretary",
  "Stake Clerk",
  "High Councilor 1",
  "High Councilor 2",
  "High Councilor 3",
  "High Councilor 4",
  "High Councilor 5",
  "High Councilor 6",
  "High Councilor 7",
  "High Councilor 8",
  "High Councilor 9",
  "High Councilor 10",
  "High Councilor 11",
  "High Councilor 12",
  "Stake Relief Society President",
  "Stake Relief Society First Counselor",
  "Stake Relief Society Second Counselor",
  "Stake Primary President",
  "Stake Primary First Counselor",
  "Stake Primary Second Counselor",
  "Bishop (9th Ward)",
  "Bishop (10th Ward)",
  "Bishop (11th Ward)",
  "Bishop (12th Ward)",
  "Bishop (13th Ward)",
  "Bishop (14th Ward)",
  "Bishop (15th Ward)",
  "Bishop (16th Ward)",
  "Bishop (17th Ward)"
];

const PERMISSION_GROUPS = [
  "Super-Admin",
  "Admin",
  "High Councilor",
  "Stake Officer",
  "Bishop",
  "Custom"
];

const INITIAL_USERS: UserData[] = [
  {
    id: "1",
    firstName: "Thomas",
    lastName: "Jones",
    username: "president.jones",
    status: "Active",
    permissionGroup: "Super-Admin",
    role: "Stake President",
    bio: "Serving as Stake President since 2022."
  },
  {
    id: "2",
    firstName: "David",
    lastName: "Miller",
    username: "bishop.miller",
    status: "Active",
    permissionGroup: "Bishop",
    role: "Bishop (10th Ward)",
  },
  {
    id: "3",
    firstName: "James",
    lastName: "Smith",
    username: "clerk.smith",
    status: "Disabled",
    permissionGroup: "Admin",
    role: "Stake Clerk",
  },
  {
    id: "4",
    firstName: "Sarah",
    lastName: "Young",
    username: "rs.young",
    status: "Active",
    permissionGroup: "Admin",
    role: "Stake Relief Society President",
  },
  {
    id: "5",
    firstName: "Michael",
    lastName: "Anderson",
    username: "bishop.anderson",
    status: "Active",
    permissionGroup: "Bishop",
    role: "Bishop (14th Ward)",
  },
  {
    id: "6",
    firstName: "Robert",
    lastName: "Johnson",
    username: "hc.johnson",
    status: "Active",
    permissionGroup: "High Councilor",
    role: "High Councilor 1",
  },
  {
    id: "7",
    firstName: "Jennifer",
    lastName: "Lee",
    username: "primary.lee",
    status: "Disabled",
    permissionGroup: "Admin",
    role: "Stake Primary President",
  },
  {
    id: "8",
    firstName: "William",
    lastName: "Wilson",
    username: "exec.wilson",
    status: "Active",
    permissionGroup: "Stake Officer",
    role: "Stake Executive Secretary",
  }
];

type SortConfig = {
  key: keyof UserData | "name"; // "name" is a derived sort key
  direction: "asc" | "desc";
} | null;

export default function UserAdmin() {
  const [users, setUsers] = useState<UserData[]>(INITIAL_USERS);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState<Partial<UserData>>({
    firstName: "",
    lastName: "",
    username: "",
    role: "",
    permissionGroup: "Stake Officer",
    status: "Active",
    bio: ""
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [permissionFilters, setPermissionFilters] = useState<string[]>([]);

  const allStatuses = Array.from(new Set(users.map(u => u.status)));
  const allPermissions = Array.from(new Set(users.map(u => u.permissionGroup)));

  const handleSort = (key: keyof UserData | "name") => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const filteredUsers = users.filter(user => {
    const fullName = `${user.firstName} ${user.lastName}`;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      fullName.toLowerCase().includes(searchLower) ||
      user.username.toLowerCase().includes(searchLower) ||
      user.role.toLowerCase().includes(searchLower);

    const matchesStatus = statusFilters.length === 0 || statusFilters.includes(user.status);
    const matchesPermission = permissionFilters.length === 0 || permissionFilters.includes(user.permissionGroup);

    return matchesSearch && matchesStatus && matchesPermission;
  }).sort((a, b) => {
    if (!sortConfig) return 0;
    
    const { key, direction } = sortConfig;
    
    let valueA = "";
    let valueB = "";

    if (key === "name") {
      valueA = `${a.firstName} ${a.lastName}`;
      valueB = `${b.firstName} ${b.lastName}`;
    } else {
      valueA = String(a[key] ?? "");
      valueB = String(b[key] ?? "");
    }

    if (valueA < valueB) return direction === "asc" ? -1 : 1;
    if (valueA > valueB) return direction === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSelectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map(u => u.id));
    }
  };

  const toggleSelectUser = (id: string) => {
    if (selectedUsers.includes(id)) {
      setSelectedUsers(selectedUsers.filter(userId => userId !== id));
    } else {
      setSelectedUsers([...selectedUsers, id]);
    }
  };

  const handleSaveEditUser = () => {
    if (!editingUser) return;
    
    setUsers(prev => prev.map(u => u.id === editingUser.id ? editingUser : u));
    
    toast.success("Profile Updated", {
      description: `Updates for ${editingUser.firstName} ${editingUser.lastName} have been saved.`,
    });
    setEditingUser(null);
  };

  const handleAddUser = () => {
    if (!newUser.firstName || !newUser.lastName || !newUser.username || !newUser.role) {
      toast.error("Missing Information", { description: "Please fill in all required fields." });
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Password Mismatch", { description: "Passwords do not match." });
      return;
    }

    const createdUser: UserData = {
      id: Math.random().toString(36).slice(2, 11),
      firstName: newUser.firstName!,
      lastName: newUser.lastName!,
      username: newUser.username!,
      role: newUser.role!,
      permissionGroup: (newUser.permissionGroup ?? "Stake Officer") as UserData["permissionGroup"],
      status: "Active",
      bio: newUser.bio,
      avatar: undefined
    };

    setUsers([...users, createdUser]);
    
    toast.success("User Created", {
      description: `${createdUser.firstName} ${createdUser.lastName} has been added successfully.`,
    });
    
    setIsAddingUser(false);
    setNewUser({
      firstName: "",
      lastName: "",
      username: "",
      role: "",
      permissionGroup: "Stake Officer",
      status: "Active",
      bio: ""
    });
    setPassword("");
    setConfirmPassword("");
  };

  const toggleUserStatus = (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === "Active" ? "Disabled" : "Active";
    
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
    
    toast.success(`User ${newStatus === "Active" ? "Activated" : "Deactivated"}`, {
      description: `User status has been changed to ${newStatus}.`,
    });
  };

  const getStatusBadgeStyles = (status: string) => {
    switch (status) {
      case "Active":
        return "bg-green-100 text-green-700 hover:bg-green-200 border-transparent dark:bg-green-900/30 dark:text-green-400";
      case "Disabled":
        return "bg-red-100 text-red-700 hover:bg-red-200 border-transparent dark:bg-red-900/30 dark:text-red-400";
      default:
        return "bg-gray-100 text-gray-600 dark:bg-muted dark:text-muted-foreground";
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-6 py-8 max-w-[1400px]">
        
        <div className="mb-8 flex justify-between items-center">
          <h1 className="text-xl font-bold text-foreground">User Administration</h1>
        </div>

        <div className="flex justify-between items-center mb-6 gap-4">
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search" 
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
                <DropdownMenuItem onClick={() => handleSort("status")}>Status</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort("role")}>Role</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort("permissionGroup")}>Permission Group</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className={`h-10 gap-2 border-input text-foreground bg-background hover:bg-accent hover:text-accent-foreground ${(statusFilters.length > 0 || permissionFilters.length > 0) ? "border-primary text-primary" : ""}`}>
                  Filters
                  <Filter className="h-3 w-3" />
                  {(statusFilters.length > 0 || permissionFilters.length > 0) && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 min-w-[1.25rem] text-[10px] bg-primary text-primary-foreground">
                      {statusFilters.length + permissionFilters.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                {allStatuses.map(status => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={statusFilters.includes(status)}
                    onCheckedChange={(checked) => {
                      if (checked) setStatusFilters([...statusFilters, status]);
                      else setStatusFilters(statusFilters.filter(s => s !== status));
                    }}
                  >
                    {status}
                  </DropdownMenuCheckboxItem>
                ))}
                
                <DropdownMenuSeparator />
                
                <DropdownMenuLabel>Permission Group</DropdownMenuLabel>
                {allPermissions.map(perm => (
                  <DropdownMenuCheckboxItem
                    key={perm}
                    checked={permissionFilters.includes(perm)}
                    onCheckedChange={(checked) => {
                      if (checked) setPermissionFilters([...permissionFilters, perm]);
                      else setPermissionFilters(permissionFilters.filter(p => p !== perm));
                    }}
                  >
                    {perm}
                  </DropdownMenuCheckboxItem>
                ))}

                {(statusFilters.length > 0 || permissionFilters.length > 0) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-destructive justify-center font-medium"
                      onClick={() => {
                        setStatusFilters([]);
                        setPermissionFilters([]);
                      }}
                    >
                      Clear Filters
                    </DropdownMenuItem>
                  </>
                )}
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
                    checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                    onCheckedChange={toggleSelectAll}
                    className="border-muted-foreground data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                </TableHead>
                <TableHead 
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    User
                    {sortConfig?.key === "name" && (
                      <ArrowUpDown className="h-3 w-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center gap-1">
                    Status
                    {sortConfig?.key === "status" && (
                      <ArrowUpDown className="h-3 w-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort("role")}
                >
                  <div className="flex items-center gap-1">
                    Role
                    {sortConfig?.key === "role" && (
                      <ArrowUpDown className="h-3 w-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort("permissionGroup")}
                >
                   <div className="flex items-center gap-1">
                    Permission Group
                    {sortConfig?.key === "permissionGroup" && (
                      <ArrowUpDown className="h-3 w-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id} className="hover:bg-muted/50 group border-border">
                  <TableCell className="pl-4">
                    <Checkbox 
                      checked={selectedUsers.includes(user.id)}
                      onCheckedChange={() => toggleSelectUser(user.id)}
                      className="border-muted-foreground data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3 py-1">
                      <Avatar className="h-9 w-9 bg-primary text-primary-foreground">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                          {user.firstName[0]}{user.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm text-foreground">{user.firstName} {user.lastName}</div>
                        <div className="text-xs text-muted-foreground">@{user.username}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`font-medium rounded-md px-2.5 py-0.5 text-xs ${getStatusBadgeStyles(user.status)}`}>
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-foreground cursor-pointer hover:text-primary transition-colors">
                      {user.role}
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-foreground cursor-pointer hover:text-primary transition-colors">
                      {user.permissionGroup}
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-xs font-medium text-foreground border-input hover:bg-accent hover:text-accent-foreground"
                        onClick={() => toggleUserStatus(user.id, user.status)}
                      >
                        {user.status === 'Disabled' ? 'Activate' : 'Deactivate'}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-xs font-medium text-foreground border-input hover:bg-accent hover:text-accent-foreground"
                        onClick={() => setEditingUser(user)}
                      >
                        Edit
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-card">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-foreground border-input hover:bg-accent">1</Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-muted-foreground border-input opacity-50 hover:bg-accent">2</Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground">...</Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-muted-foreground border-input opacity-50 hover:bg-accent">6</Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-foreground border-input hover:bg-accent">
                <span className="sr-only">Next</span>
                <ChevronDown className="h-3 w-3 -rotate-90" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
               <Button variant="outline" size="sm" className="h-8 gap-2 text-xs font-medium text-foreground border-input hover:bg-accent">
                10
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent className="max-w-[90vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl">Edit User Profile</DialogTitle>
            </DialogHeader>
            
            {editingUser && (
              <div className="grid gap-6 py-4">
                {/* Photo & Basic Info */}
                <div className="flex items-start gap-6">
                  <div className="flex flex-col items-center gap-2">
                    <Avatar className="h-24 w-24 border-2 border-border">
                      <AvatarImage src={editingUser.avatar} />
                      <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                        {editingUser.firstName[0]}{editingUser.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <Button variant="outline" size="sm" className="w-full text-xs gap-1">
                      <Upload className="h-3 w-3" /> Change Photo
                    </Button>
                  </div>
                  
                  <div className="flex-1 grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>First Name</Label>
                        <Input 
                          value={editingUser.firstName} 
                          onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Last Name</Label>
                        <Input 
                          value={editingUser.lastName} 
                          onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Username</Label>
                      <Input value={`@${editingUser.username}`} disabled className="bg-muted text-muted-foreground" />
                    </div>
                  </div>
                </div>

                <div className="border-t my-1" />

                {/* Roles & Permissions */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select 
                      value={editingUser.role} 
                      onValueChange={(val) => setEditingUser({ ...editingUser, role: val })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role}>{role}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Permission Group</Label>
                    <Select 
                      value={editingUser.permissionGroup} 
                      onValueChange={(val) => setEditingUser({ ...editingUser, permissionGroup: val as UserData["permissionGroup"] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PERMISSION_GROUPS.map((group) => (
                          <SelectItem key={group} value={group}>{group}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Bio */}
                <div className="space-y-2">
                  <Label>Bio</Label>
                  <Textarea 
                    value={editingUser.bio || ""} 
                    onChange={(e) => setEditingUser({ ...editingUser, bio: e.target.value })}
                    placeholder="Brief description or notes about the user..."
                    className="min-h-[100px]"
                  />
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
              <Button onClick={handleSaveEditUser}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isAddingUser} onOpenChange={setIsAddingUser}>
          <DialogContent className="max-w-[90vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl">Add New User</DialogTitle>
            </DialogHeader>
            
            <div className="grid gap-6 py-4">
              {/* Photo & Basic Info */}
              <div className="flex items-start gap-6">
                <div className="flex flex-col items-center gap-2">
                  <Avatar className="h-24 w-24 border-2 border-border">
                    <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                      {(newUser.firstName?.[0] || "") + (newUser.lastName?.[0] || "")}
                    </AvatarFallback>
                  </Avatar>
                  <Button variant="outline" size="sm" className="w-full text-xs gap-1">
                    <Upload className="h-3 w-3" /> Upload Photo
                  </Button>
                </div>
                
                <div className="flex-1 grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>First Name</Label>
                      <Input 
                        value={newUser.firstName} 
                        onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                        placeholder="John"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Last Name</Label>
                      <Input 
                        value={newUser.lastName} 
                        onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                        placeholder="Doe"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground">@</span>
                      <Input 
                        value={newUser.username} 
                        onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                        className="pl-7"
                        placeholder="username"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Password Fields */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border border-border">
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <Input 
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="border-t my-1" />

              {/* Roles & Permissions */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select 
                    value={newUser.role} 
                    onValueChange={(val) => setNewUser({ ...newUser, role: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>{role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Permission Group</Label>
                  <Select 
                    value={newUser.permissionGroup} 
                    onValueChange={(val) => setNewUser({ ...newUser, permissionGroup: val as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERMISSION_GROUPS.map((group) => (
                        <SelectItem key={group} value={group}>{group}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Bio */}
              <div className="space-y-2">
                <Label>Bio</Label>
                <Textarea 
                  value={newUser.bio || ""} 
                  onChange={(e) => setNewUser({ ...newUser, bio: e.target.value })}
                  placeholder="Brief description or notes about the user..."
                  className="min-h-[100px]"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsAddingUser(false)}>Cancel</Button>
              <Button onClick={handleAddUser}>Create User</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
