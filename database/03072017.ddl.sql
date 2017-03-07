CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE "tblArticles"
(
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY NOT NULL,
  image VARCHAR(250),
  paragraph VARCHAR(2000),
  title VARCHAR
);