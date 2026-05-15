import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t py-12 bg-muted/30">
      <div className="container mx-auto px-4 grid md:grid-cols-3 gap-8">
        <div className="space-y-4">
          <h3 className="font-serif font-bold text-lg">Logan Married Student 2nd Stake</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This website is not an official product of The Church of Jesus Christ of Latter-day Saints and is not sponsored, endorsed, or approved by the Church in any way. The content, images, and other materials contained herein do not represent the official positions or views of The Church of Jesus Christ of Latter-day Saints.
          </p>
        </div>
        <div className="text-center">
          <h4 className="font-semibold mb-4">Contact</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>1550 N 400 E</li>
            <li>Logan, UT 84321</li>
            <li>lmssecondstake@gmail.com</li>
          </ul>
        </div>
        <div className="text-left md:text-right">
           <h4 className="font-semibold mb-4">Sacrament Times</h4>
           <p className="text-sm text-muted-foreground">
             Sunday<br />
             8:30am, 10:00am<br />
             11:30am, 1:00pm
           </p>
        </div>
      </div>
      <div className="container mx-auto px-4 mt-12 pt-8 border-t text-center text-xs text-muted-foreground">
        <Link href="/license" className="hover:underline hover:text-primary transition-colors">
          © 2026 Multiplex Labs. Released under the MIT License.
        </Link>
      </div>
    </footer>
  );
}
