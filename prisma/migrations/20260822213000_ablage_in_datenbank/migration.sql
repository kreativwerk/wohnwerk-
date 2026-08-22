-- Dokumentenablage direkt in der Datenbank: braucht keine weiteren
-- Umgebungsvariablen und funktioniert damit sofort auf Vercel.

-- CreateTable
CREATE TABLE "AblageDatei" (
    "id" TEXT NOT NULL,
    "pfad" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "daten" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AblageDatei_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AblageDatei_pfad_key" ON "AblageDatei"("pfad");

-- Gleiche Absicherung wie bei allen anderen Tabellen: kein Zugriff ueber
-- die Supabase-Client-Rollen, nur ueber die Server-Verbindung der App.
ALTER TABLE "AblageDatei" ENABLE ROW LEVEL SECURITY;

-- Die Supabase-Rollen gibt es in der lokalen Entwicklungsdatenbank nicht,
-- deshalb nur widerrufen, wo sie existieren.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "AblageDatei" FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "AblageDatei" FROM authenticated;
  END IF;
END $$;
