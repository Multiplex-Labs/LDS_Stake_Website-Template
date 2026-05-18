import { redirect } from 'next/navigation';
import { DOCS_DEFAULT } from '@/lib/constants';

export default function Home() {
  redirect(DOCS_DEFAULT);
}
