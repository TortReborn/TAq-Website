-- Editable application forms (TAQ-217)
-- Mirror of the block in Tort-Reborn/schema.sql; run once per database.

-- Every save of a form at /exec/application-forms is a revision; the newest
-- one per form is live. A form with no revision uses the defaults in
-- lib/application-questions.ts. A restore is a new revision copying an old one.
-- content shape: FormContent in lib/application-questions.ts.
CREATE TABLE IF NOT EXISTS application_form_revisions (
    id            SERIAL       PRIMARY KEY,
    form_type     VARCHAR(20)  NOT NULL CHECK (form_type IN ('guild', 'community', 'hammerhead')),
    rev_number    INT          NOT NULL,
    content       JSONB        NOT NULL,
    note          VARCHAR(200) NOT NULL DEFAULT '',
    restored_from INT,                             -- rev_number this one restored
    author_id     BIGINT,
    author_name   VARCHAR(64),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (form_type, rev_number)
);

-- The questions as the applicant saw them ({sections: [{title, task, questions: [{id, label}]}]}),
-- so the bot labels answers from the submission itself. NULL on applications
-- from before TAQ-217; the bot falls back to its old labels for those.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS questions JSONB;
