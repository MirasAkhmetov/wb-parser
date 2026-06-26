interface PageShellProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export default function PageShell({ title, description, children }: PageShellProps) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-gray-600">{description}</p>
      </header>
      {children}
    </div>
  );
}
