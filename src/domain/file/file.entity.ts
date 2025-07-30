import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, BeforeInsert } from "typeorm";
import { generateUuidV7 } from "src/common/utils/generator";

@Entity("files")
export class FileEntity {
    @PrimaryColumn("uuid")
    id: string;

    @Column({ length: 512 })
    originalFileName: string;

    @Column({ length: 512 })
    fileName: string;

    @Column({ length: 1024 })
    filePath: string;

    @Column()
    mimeType: string;

    @Column({ type: "bigint" })
    size: number;

    @Column({ length: 64, nullable: true })
    hash: string;

    @Column({ type: "text", nullable: true })
    description: string;

    @Column({ default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ nullable: true })
    uploadedBy: string;

    @Column({ length: 100, nullable: true })
    category: string;

    @Column({ type: "json", nullable: true })
    metadata: Record<string, any>;

    @BeforeInsert()
    generateId() {
        if (!this.id) {
            this.id = generateUuidV7();
        }
    }
}
