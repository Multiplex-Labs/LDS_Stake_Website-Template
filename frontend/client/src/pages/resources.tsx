import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Search, 
  Filter, 
  Calendar, 
  Clock, 
  Tag, 
  ChevronRight,
  BookOpen,
  Megaphone,
  Heart,
  Users,
  Plus
} from "lucide-react";

// Mock Data for Blog Posts
interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  category: "Announcements" | "Spiritual" | "Welfare" | "Youth" | "YSA";
  author: string;
  date: string;
  readTime: string;
  image?: string;
}

const POSTS: BlogPost[] = [
  {
    id: "1",
    title: "Upcoming Stake Conference Schedule",
    excerpt: "Join us for our semi-annual Stake Conference. Sessions will be held Saturday evening for adults and Sunday morning for the general membership.",
    category: "Announcements",
    author: "Stake Presidency",
    date: "Aug 15, 2025",
    readTime: "2 min read",
  },
  {
    id: "2",
    title: "Understanding the New Youth Theme",
    excerpt: "A deep dive into this year's youth theme and how we can apply it in our daily lives as we strive to become more like the Savior.",
    category: "Youth",
    author: "Sister Young",
    date: "Aug 10, 2025",
    readTime: "5 min read",
  },
  {
    id: "3",
    title: "Welfare Assignment Opportunities",
    excerpt: "We have several opportunities to serve at the Bishop's Storehouse and Cannery this month. Sign up to help those in need.",
    category: "Welfare",
    author: "High Council",
    date: "Aug 5, 2025",
    readTime: "3 min read",
  },
  {
    id: "4",
    title: "Institute Class Registration Now Open",
    excerpt: "Fall semester institute classes are now open for registration. Check out the new course offerings including 'Teachings of the Living Prophets'.",
    category: "YSA",
    author: "Institute Director",
    date: "Aug 1, 2025",
    readTime: "1 min read",
  },
  {
    id: "5",
    title: "Finding Peace in Times of Turmoil",
    excerpt: "A spiritual thought on how to maintain personal peace and spiritual stability when the world around us feels chaotic.",
    category: "Spiritual",
    author: "President Jones",
    date: "Jul 28, 2025",
    readTime: "6 min read",
  },
  {
    id: "6",
    title: "Temple Night Schedule Change",
    excerpt: "Please note the updated schedule for ward temple nights. Transportation will now be provided from the south parking lot.",
    category: "Announcements",
    author: "Stake Clerk",
    date: "Jul 20, 2025",
    readTime: "1 min read",
  }
];

const CATEGORIES = ["All", "Announcements", "Spiritual", "Welfare", "Youth", "YSA"];

function getCategoryIcon(category: string) {
  switch (category) {
    case "Announcements": return <Megaphone className="h-4 w-4" />;
    case "Spiritual": return <BookOpen className="h-4 w-4" />;
    case "Welfare": return <Heart className="h-4 w-4" />;
    case "Youth":
    case "YSA": return <Users className="h-4 w-4" />;
    default: return <Tag className="h-4 w-4" />;
  }
}

function getCategoryColor(category: string) {
  switch (category) {
    case "Announcements": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "Spiritual": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
    case "Welfare": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "Youth": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "YSA": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  }
}

export default function Resources() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredPosts = POSTS.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          post.excerpt.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "All" || post.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <Layout>
      <div className="bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <h1 className="font-serif text-4xl font-bold text-center mb-4">Resources & News</h1>
          <p className="text-center text-muted-foreground max-w-2xl mx-auto">
            Stay updated with the latest announcements, spiritual thoughts, and resources for our stake.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        {/* Search and Filter Bar */}
        <div className="flex flex-col md:flex-row gap-4 mb-8 max-w-7xl mx-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search resources..." 
              className="pl-10 h-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full md:w-[200px]">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* New Post Button */}
        <div className="flex justify-start mb-6 max-w-7xl mx-auto">
          <Button 
            className="hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Post
          </Button>
        </div>

        {/* Categories Pills (Desktop) */}
        <div className="hidden md:flex flex-wrap gap-2 mb-12 max-w-7xl mx-auto justify-center">
          {CATEGORIES.map(category => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              onClick={() => setSelectedCategory(category)}
              className="rounded-full"
              size="sm"
            >
              {category}
            </Button>
          ))}
        </div>

        {/* Blog Grid */}
        {filteredPosts.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
            {filteredPosts.map((post) => (
              <Card key={post.id} className="flex flex-col h-full hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant="secondary" className={`gap-1 ${getCategoryColor(post.category)}`}>
                      {getCategoryIcon(post.category)}
                      {post.category}
                    </Badge>
                  </div>
                  <CardTitle className="font-serif text-xl line-clamp-2">{post.title}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-2">
                    <span className="font-medium text-foreground">{post.author}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {post.date}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="text-muted-foreground line-clamp-3">
                    {post.excerpt}
                  </p>
                </CardContent>
                <CardFooter className="border-t pt-4">
                  <div className="flex justify-between items-center w-full text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {post.readTime}
                    </span>
                    <Button variant="ghost" size="sm" className="gap-1 hover:text-primary p-0">
                      Read More <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">No resources found matching your search.</p>
            <Button 
              variant="link" 
              onClick={() => {
                setSearchTerm("");
                setSelectedCategory("All");
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
