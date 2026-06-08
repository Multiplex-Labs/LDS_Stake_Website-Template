import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";

export default function License() {
  return (
    <Layout>
      <div className="bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <h1 className="font-serif text-4xl font-bold text-center mb-4">MIT License</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <Card className="max-w-3xl mx-auto border-t-4 border-t-primary shadow-lg">
          <CardContent className="pt-6 text-sm leading-relaxed whitespace-pre-wrap">
            <p className="mb-4 font-bold">Copyright © 2026 Multiplex Labs</p>

            <p className="mb-4">
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
            </p>

            <p className="mb-4">
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
            </p>

            <p>
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NON INFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
